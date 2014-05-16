var sparql = require("sparql");
var client;

exports.prepare = function () {
    client = new sparql.Client('http://data.linkedtv.eu/sparql');
    client.prefix_map = {
        'ma': 'http://www.w3.org/ns/ma-ont#',
        'rdfs': 'http://www.w3.org/2000/01/rdf-schema#'
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

        if (locator.value.indexOf('http://stream17.noterik.com/') >= 0) {
            locator.value += '/rawvideo/2/raw.mp4';
        }
        callback(false, locator);
    });
};


function generateIdentifier(uuid) {
    return "<http://data.linkedtv.eu/media/" + uuid + ">";
}

function Query() {
    this.q = {
        select: null,
        where: []
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
    return s;
};