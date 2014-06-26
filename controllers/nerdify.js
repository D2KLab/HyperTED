var nerd = require("nerd4node");

var api_instance = "nerd.eurecom.fr/api/";
var apiID = '1qb6bi7kjmcudkh5gsqr79ufmflo4mlu';
var t = "";
var gran = "oed";
var to = 10; //timeOut


function getEntities(doc_type, text, ext, callback) {
    if (ext == null || ext == '')ext = "textrazor";
    if (text != null && text != '') {
        nerd.annotate(api_instance, apiID, ext, doc_type, text, gran, to, function (err, data) {
            callback(err, data);
        });
    } else {
        callback(true, 'Empty Text');
    }
}

exports.getEntities = getEntities;
