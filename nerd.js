var nerd = require("nerd4node"),
    filesys = require("fs");

var api_instance = "nerd.eurecom.fr/api/";
var apiID = '1qb6bi7kjmcudkh5gsqr79ufmflo4mlu';
var ext = 'dbspotlight';
var doc_type = "text"; //timedtext|text
var t = "";
var gran = "oed";
var to = 2; //timeOut

function start(callback) {
    filesys.readFile("./text.txt", "binary", function (err, file) {
        if (err) {
            callback(err, "file unreadable");
        } else {
            t = file;
            nerd.annotate(api_instance, apiID, ext, doc_type, t, gran, to, function (err, data) {
                callback(err, data);
            });


        }
    });
}

exports.start = start;
