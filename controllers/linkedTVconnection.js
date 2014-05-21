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

exports.getLocator = function (uuid, callback) {
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
        }else{
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

exports.findFromLocator = function (locator) {
    var t = locator.indexOf('?ticket');
    if (t > 0) {
        locator = locator.substring(0, t);
    }

    var q = new Query().select('?MediaResource', true)
        .where('?MediaResource', 'ma:locator', locator).where('?MediaResource', 'a', 'ma:MediaResource').limit(1);

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

        //TODO estrarre uuid
        callback(false, locator);
    });
};

function generateIdentifier(uuid) {
    return "<http://data.linkedtv.eu/media/" + uuid + ">";
}

function Query() {
    this.q = {
        select: null,
        where: [],
        orderby: '',
        limit: -1
    }
}

Query.prototype.select = function (args, distinct) {
    this.q.select = distinct ? 'DISTINCT ' + args : args;
    return this;
};

Query.prototype.where = function (subj, verb, obj) {
    this.q.where.push(subj + ' ' + verb + ' ' + obj);
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
    if (q.select == null) throw new Error('Select part undefined');
    var s = 'SELECT ' + q.select;
    if (q.where) {
        s += ' WHERE {';
        q.where.forEach(function (w) {
            s += w + ' . ';
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