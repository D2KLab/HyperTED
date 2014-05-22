var http = require('http'),
    sparql = require("sparql");
var client;

exports.prepare = function () {
    client = new sparql.Client('http://data.linkedtv.eu/sparql');
    client.prefix_map = {
        'ma': 'http://www.w3.org/ns/ma-ont#',
        'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
        'oa': 'http://www.w3.org/ns/oa#',
        'linkedtv': 'http://data.linkedtv.eu/ontologies/core#',
        'nsa': 'http://multimedialab.elis.ugent.be/organon/ontologies/ninsuna#'
    };
};

exports.getFromUuid = function (uuid, callback) {
    var identifier = generateIdentifier(uuid);
    var q = new Query().select('?locator', true).where(identifier, 'a', 'ma:MediaResource').where(identifier, 'ma:locator', '?locator');

    console.log("[SPARQL]  " + q.toString());
    client.query(q.toString(), function (err, data) {
        if (err) {
            callback(err, err.message);
            return;
        }
        var bindings = data.results.bindings;
        if (bindings.length == 0) {
            callback(true, 'No results');
        }

        var locator = bindings[0].locator;
        if (locator.type != 'uri') {
            //TODO
        } else {
            locator = locator.value;
        }

        callback(false, locator);
    });
};

exports.getChapters = function (uuid, callback) {
    var identifier = generateIdentifier(uuid);
    var q = new Query().select('?mediafragment, ?chapter, ?tEnd, ?tStart, ?tUnit', true)
        .where('?mediafragment', 'a', 'ma:MediaFragment')
        .where('?mediafragment', 'ma:isFragmentOf', identifier)
        .where('?mediafragment', 'nsa:temporalEnd', '?tEnd')
        .where('?mediafragment', 'nsa:temporalStart', '?tStart')
        .where('?mediafragment', 'nsa:temporalUnit', '?tUnit')
        .where('?annotation', 'a', 'oa:Annotation')
        .where('?annotation', 'oa:hasTarget', '?mediafragment')
        .where('?annotation', 'oa:hasBody', '?chapter')
        .where('?chapter', 'a', 'linkedtv:Chapter').orderby('?tStart');


    console.log("[SPARQL]  " + q.toString());
    client.rows(q.toString(), function (err, data) {
        if (err) {
            console.log(err);
            callback(err, err.message);
            return;
        }
        callback(false, data);
    });
};

exports.getFromLocator = function (locator, callback) {
    var t = locator.indexOf('?ticket');
    if (t > 0) {
        locator = locator.substring(0, t);
    }

    var q = new Query().select('?MediaResource')
        .where('?MediaResource', 'a', 'ma:MediaResource')
        .where('?MediaResource', 'ma:locator', '<' + locator + '>');

    q = qAddChapterOf('?MediaResource', q);

    console.log(q.toString());
    client.query(q.toString(), function (err, data) {
        if (err) {
            //TODO
            console.log(err);
            callback(err, data);
            return;
        }
        var bindings = data.results.bindings;
        if (bindings.length == 0) {
            console.log("No results");
            callback(err, null);
            return;
        } else if (bindings.length == 1) {
            result = bindings[0];
        } else {
            var result;
            bindings.forEach(function (row) {
                if (!result) { //prima riga
                    if (row.chapter) {
                        result = {
                            MediaResource: {
                                type: row.MediaResource.type,
                                value: row.MediaResource.value
                            }
                        };
                        delete row.MediaResource;
                        result.chapters = [];
                        result.chapters.push(row);
                    } else {
                        result = row;
                    }
                    return;
                }

                if (row.MediaResource.value == result.MediaResource.value) {
                    if (row.chapter) {
                        delete row.MediaResource;
                        if (!result.chapters) {
                            result.chapters = [];
                        }
                        result.chapters.push(row);
                    }//else not possible for now
                } else {
                    if (!result.chapters && row.chapter) { //prefere row to result
                        result = {
                            MediaResource: {
                                type: row.MediaResource.type,
                                value: row.MediaResource.value
                            }
                        };
                        delete row.MediaResource;
                        result.chapters = [];
                        result.chapters.push(row);
                    }//else do nothing
                }
            });

        }

        //extract uuid
        var re = /data\.linkedtv\.eu\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
        result.ltv_uuid = re.exec(result.MediaResource.value)[1];

        callback(err, result);
    });
};

function qAddChapterOf(mr, q) {
    return q.select('?mediafragment, ?chapter, ?tEnd, ?tStart, ?tUnit')
        .textWhere('?mediafragment a ma:MediaFragment. ' +
            '?mediafragment ma:isFragmentOf ' + mr + ' . ' +
            '?mediafragment nsa:temporalEnd ?tEnd. ' +
            '?mediafragment nsa:temporalStart ?tStart. ' +
            '?mediafragment nsa:temporalUnit ?tUnit. ' +
            '?annotation a oa:Annotation. ' +
            '?annotation oa:hasTarget ?mediafragment. ' +
            '?annotation oa:hasBody ?chapter. ' +
            '?chapter a linkedtv:Chapter. ', true).orderby('?tStart');
}

function generateIdentifier(uuid) {
    return "<http://data.linkedtv.eu/media/" + uuid + ">";
}

function Query() {
    this.q = {
        select: [],
        where: [],
        orderby: '',
        limit: -1
    }
}
Query.prototype.select = function (args) {
    this.q.select.push(args);
    return this;
};
Query.prototype.where = function (subj, verb, obj, optional) {
    var w = subj + ' ' + verb + ' ' + obj + ' . ';
    if (optional) {
        w = ' OPTIONAL { ' + w + ' } ';
    }
    this.q.where.push(w);
    return this;
};
Query.prototype.textWhere = function (text, optional) {
    if (optional) {
        text = ' OPTIONAL { ' + text + ' } ';
    }
    this.q.where.push(text);
    return this;
};
Query.prototype.orderby = function (subj) {
    this.q.orderby = subj;
    return this;
};
Query.prototype.limit = function (n) {
    if (typeof n != "number") {
        console.log("Limit is not a number. I will ignore it");
        return this;
    }
    this.q.limit = n;
    return this;
};
Query.prototype.toString = function () {
    var q = this.q;
    if (q.select == null || q.select == []) throw new Error('Select part undefined');
    var s = 'SELECT DISTINCT ' + q.select.toString();

    if (q.where) {
        s += ' WHERE {';
        q.where.forEach(function (w) {
            s += w;
        });
        s += ' }'
    }
    if (q.orderby) {
        s += ' ORDER BY ' + q.orderby;
    }
    if (q.limit > 0) {
        s += ' LIMIT ' + q.limit;
    }
    return s;
};