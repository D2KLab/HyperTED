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
        'nsa': 'http://multimedialab.elis.ugent.be/organon/ontologies/ninsuna#',
        'dc': 'http://purl.org/dc/elements/1.1/',
        'owl': 'http://www.w3.org/2002/07/owl#'
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

        var locator = bindings[0].locator.value;
        callback(false, locator);
    });
};

exports.getFromLocator = function (locator, callback) {
    var t = locator.indexOf('?ticket');
    if (t > 0) {
        locator = locator.substring(0, t);
    }

    var q = new Query().select('?MediaResource').select('?mediafragment, ?chapter, ?tEnd, ?tStart, ?tUnit, ?keyURL, ?label, ?source')
        .where('?MediaResource', 'a', 'ma:MediaResource')
        .where('?MediaResource', 'ma:locator', '<' + locator + '>').textWhere('?mediafragment a ma:MediaFragment. ' +
            '?mediafragment ma:isFragmentOf ?MediaResource. ' +
            '?mediafragment nsa:temporalEnd ?tEnd. ' +
            '?mediafragment nsa:temporalStart ?tStart. ' +
            '?mediafragment nsa:temporalUnit ?tUnit. ' +
            'OPTIONAL { ' +
            '?annotation a oa:Annotation.' +
            '?annotation oa:hasTarget ?mediafragment.' +
            '?annotation oa:hasBody ?chapter.' +
            '?chapter a linkedtv:Chapter. }' +
            ' OPTIONAL {' +
            '?mediafragment linkedtv:hasSubtitle ?subtitle.' +
            '?entityAnnotation a oa:Annotation.' +
            '?entityAnnotation oa:hasTarget ?mediafragment.' +
            '?entityAnnotation oa:hasBody ?entity.' +
            '?entity owl:sameAs ?keyURL.' +
            'OPTIONAL{ ?entity rdfs:label ?label.}' +
            'OPTIONAL{ ?entity dc:source ?source.}}'
        , true).orderby('?tStart');


    console.log(q.toString());
    client.query(q.toString(), function (err, data) {
        if (err) {
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
            result = reduceSparqlJSON(bindings);
        }

        //extract uuid
        var re = /data\.linkedtv\.eu\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
        result.ltv_uuid = re.exec(result.MediaResource.value)[1];

        callback(err, result);
    });
};
function reduceSparqlJSON(bindings) {
    "use strict";
    var result;

    var IDs = [];
    bindings.forEach(function (row) {
        var thisID = row.MediaResource.value;

        if (IDs.length == 0 || !thisID in IDs) {
            IDs.push(thisID);
        }
    });

    var results = [];
    IDs.forEach(function (id) {
        var MR = {};
        bindings.filter(function (row) {
            return row.MediaResource.value == id;
        }).forEach(function (row) {
            if (!MR.MediaResource) {
                MR.MediaResource = row.MediaResource;
            }
            if (row.chapter) {
                if (!MR.chapters) {
                    MR.chapters = [];
                }
                var chapter = {
                    chapter: row.chapter,
                    tStart: row.tStart,
                    tEnd: row.tEnd,
                    tUnit: row.tUnit,
                    mediafragment: row.mediafragment
                };
                MR.chapters.push(chapter);
            }
            if (row.keyURL) {
                if (!MR.entities) {
                    MR.entities = [];
                    MR.entitiesFromLTV = true;
                }
                var entity = {
                    uri: row.keyURL,
                    label: row.label.value,
                    extractor: row.source.value,
                    startNPT: parseFloat(row.tStart.value),
                    endNPT: parseFloat(row.tEnd.value),
                    tUnit: row.tUnit.value,
                    nerdType: 'http://nerd.eurecom.fr/ontology#Thing', //TODO
                    mediafragment: row.mediafragment
                };
                MR.entities.push(entity);
            }
        });

        results.push(MR);
    });

    result = results.filter(function (res) {
        return res.chapters || res.entities;
    });
    if (result.length > 1) {
        result = result.filter(function (res) {
            return res.chapters;
        });
    }
    console.log(result[0]);
    return result[0];
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