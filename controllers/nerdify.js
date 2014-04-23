var nerd = require("nerd4node"),
    Cache = require("node-cache");

var nerdCache;
var api_instance = "nerd.eurecom.fr/api/";
var apiID = '1qb6bi7kjmcudkh5gsqr79ufmflo4mlu';
var ext = 'textrazor';
var t = "";
var gran = "oed";
var to = 10; //timeOut

//exports.start = function (text, doc_type, callback) {
exports.start = function (req, res) {
    var text = req.query.text;
    var doc_type = req.query.type;
    var video_id = req.query.videoid;
    var vendor = req.query.vendor;
    var cacheKey = vendor + video_id + doc_type;

    var json;
    if (json = getFromCache(cacheKey)) {
        console.log("sending entities from cache");
        res.json(json);
        return;
    }

    getEntities(doc_type, text, function (err, data) {
        if (err) {
            console.log(err);
            res.send(500, err.message);
        } else {
            console.log('sending entities from nerd');
            nerdCache.set(cacheKey, data);
            res.json(data);
        }
    });
};

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

function getFromCache(key) {
    if (!nerdCache) {
        nerdCache = new Cache();
        return false;
    } else {
        var cachedData = nerdCache.get(key);
        return cachedData[key];
    }
}