var nerd = require("nerd4node");

var api_instance = "nerd.eurecom.fr/api/";
var apiID = '1qb6bi7kjmcudkh5gsqr79ufmflo4mlu';
var ext = 'textrazor';
var t = "";
var gran = "oed";
var to = 10; //timeOut

function getEntities(doc_type, text, callback) {
    if (text != null && text != '') {
        nerd.annotate(api_instance, apiID, ext, doc_type, text, gran, to, function (err, data) {
            callback(err, data);
        });
    } else {
        callback(true, 'Empty Text');
    }
}

exports.getEntities = getEntities;
