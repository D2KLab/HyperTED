var nerd = require("nerd4node"),
    http = require('http'),
    utils = require('./utils');


var api_instance = "nerd.eurecom.fr/api/";
//var apiID = '1qb6bi7kjmcudkh5gsqr79ufmflo4mlu';
var apiID = '155ma0q9dpavn42uol7geocve20t1l22';
var gran = "oed";
var to = 10; //timeOut


function getEntities(doc_type, text, ext, callback) {
    if (ext == null || ext == '') ext = "textrazor";
    if (text != null && text != '') {
        nerd.annotate(api_instance, apiID, ext, doc_type, text, gran, to, function (err, data) {
            if (err) {
                callback(err, data);
                return;
            }
            var entsLeft = data.length;
            console.log('TOT Ents ' + entsLeft);

            data.forEach(function (ent) {
                if (ent.uri) {
                    getDbpediaAbstract(ent.uri, function (err, abstract) {
                        ent.abstract = abstract;
                        --entsLeft;
                        if (entsLeft == 0) {
                            --entsLeft;
                            callback(null, data);
                        }
                    });
                } else --entsLeft;

                if (entsLeft == 0) {
                    --entsLeft;
                    callback(null, data);
                }
            });
        });
    } else {
        callback(true, 'Empty Text');
    }
}

function getDbpediaAbstract(wikiUrl, callback) {
    var topic;
    if (wikiUrl.indexOf('wikipedia') >= 0) {
        topic = "?res <http://xmlns.com/foaf/0.1/isPrimaryTopicOf> <" + wikiUrl + ">.";
    } else if (wikiUrl.indexOf('dbpedia') >= 0) {
        topic = "FILTER (?res = <" + wikiUrl + "> ). ";
    }
    if (!topic) {
        var tErr = new Error("could not retrieve abstract for " + wikiUrl);
        console.warn(tErr);
        callback(tErr);
        return;
    }
    var query = "select distinct ?res ?abstract where {" +
        " ?res dbpedia-owl:abstract ?abstract. " + topic +
        " FILTER langMatches( lang(?abstract), 'en')" +
        "} LIMIT 100";

    var fullUrl = "http://dbpedia.org/sparql?query=" + query +
        "&format=json";

    http.getJSON(fullUrl, function (err, data) {
        if (err) {
            console.error(err);
        }
        if (err || !data.results.bindings || !data.results.bindings.length) {
            callback(err, data);
            return;
        }
        try {
            var abstract = data.results.bindings[0].abstract.value;
            callback(err, abstract)
        } catch (e) {
            console.error(e);
            callback(e);
        }
    });
}

exports.getEntities = getEntities;
