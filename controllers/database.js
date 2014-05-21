var UUID = require("node-uuid"),
    monk = require('monk');
var db, videos;


exports.prepare = function () {
    db = monk('localhost:27017/hyperted');
    videos = db.get('videos');
    videos.index('uuid', {unique: true});
    videos.index('locator', {unique: true});
};

exports.getLocator = function (uuid, callback) {
    videos.findOne({uuid: uuid}).on('complete', callback);
};

exports.getUUID = function (locator, callback) {
//    videos.findOne({locator: ""+locator}).on('success', function(err, data){
//        console.log(err);
//    });
    videos.findOne({locator: locator}).on('complete', callback);
};

exports.insert = function (locator, callback) {
    var uuid = UUID.v4();
    videos.insert({
        "uuid": uuid,
        "locator": locator
    }, function (err, doc) {
        if (err) {
            console.log('DB insert fail. ' + JSON.stringify(err));
            console.log('Check for existent locator.');
            videos.findOne({locator: locator}).on('complete', callback);
        } else {
            var data = {
                uuid: uuid,
                locator: locator
            };
            callback(false, data);
        }

    });
};