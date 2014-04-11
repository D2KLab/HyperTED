var nerd = require("nerd4node");

var api_instance = "nerd.eurecom.fr/api/";
var apiID = '1qb6bi7kjmcudkh5gsqr79ufmflo4mlu';
var ext = 'dbspotlight';
var doc_type = "text"; //timedtext|text
var t = "";
var gran = "oed";
var to = 2; //timeOut

function start(text, callback) {
    if (text != null && text != '') {
        nerd.annotate(api_instance, apiID, ext, doc_type, text, gran, to, function (err, data) {
            callback(err, data);
        });
    }else(callback(true, 'Empty Text'))

}

exports.start = start;
