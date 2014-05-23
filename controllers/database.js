var UUID = require("node-uuid"),
    monk = require('monk');
var db, videos;


exports.prepare = function () {
    db = monk('localhost:27017/hyperted');
    videos = db.get('videos');
    videos.index('uuid', {unique: true});
    videos.index('locator', {unique: true});
};

function getFromUuid(uuid, callback) {
    videos.findOne({uuid: uuid}).on('complete', callback);
};

exports.getFromUuid = getFromUuid;
exports.getFromLocator = function (locator, callback) {
    videos.findOne({locator: locator}).on('complete', callback);
};

exports.insert = function (video, callback) {
    video.uuid = UUID.v4();
    //TODO check if used uuid
    videos.insert(video, function (err, doc) {
        if (err) {
            console.log('DB insert fail. ' + JSON.stringify(err));
            console.log('Check for existent locator.');
            videos.findOne({locator: locator}).on('complete', callback);
        } else {
            callback(err, doc);
        }
    });
};

function update(uuid, newVideo, callback) {
    videos.update({uuid: uuid}, newVideo, function (err, doc) {
        if (err) {
            console.log('DB update fail. ' + JSON.stringify(err));
        }
        callback(err, doc);
    });
};

exports.update = update;

exports.addEntities = function (uuid, entities, callback) {
    getFromUuid(uuid, function (err, video) {
        if (err || !video) {
            console.log('DB add entities fail. ' + JSON.stringify(err));
            callback(err, video);
        }
        video.entities = entities;

        update(uuid, video, callback);
    });

};