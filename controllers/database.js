var UUID = require("node-uuid"),
    monk = require('monk');
var db, videos;


exports.prepare = function () {
    db = monk('localhost:27017/hyperted');
    videos = db.get('videos');
    videos.index('uuid', {unique: true});
    videos.index('locator', {unique: true});
    videos.index('vendor vendor_id', {unique: true});
};

function getFromUuid(uuid, callback) {
    videos.findOne({uuid: uuid}).on('complete', callback);
}
exports.getFromUuid = getFromUuid;

exports.getFromLocator = function (locator, callback) {
    videos.findOne({locator: locator}).on('complete', callback);
};
exports.getFromVendorId = function (vendor, id, callback) {
    if (!vendor || !id) {
        callback(true);
        return;
    }
        console.log(vendor, id);

    videos.findOne({'vendor': vendor, 'vendor_id': id}).on('success', function(err, data){
        console.log(err);
        console.log(data);
                callback(err,data);

    });
};

exports.insert = function (video, callback) {
    video.uuid = UUID.v4();
    video.timestamp = Date.now();
    if (video.entities) {
        video.entTimestamp = Date.now();
    }
    callback = callback || function(){};

    videos.insert(video, function (err, doc) {
        if (err) {
            console.log('DB insert fail. ' + JSON.stringify(err));
            console.log('Check for existent uuid.');
            videos.findOne({uuid: video.uuid}).on('complete', function (e, data) {
                if (!e && data) { //retry with another uuid
                    exports.insert(video, callback);
                } else {
                    callback(e, data);
                }
            });
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
}
exports.update = update;

exports.updateVideo = function(newVideo, callback) {
    videos.update({uuid: newVideo.uuid}, newVideo, function (err, doc) {
        if (err) {
            console.log('DB update fail. ' + JSON.stringify(err));
        }
        callback(err, doc);
    });
}


exports.addEntities = function (uuid, entities, callback) {
    getFromUuid(uuid, function (err, video) {
        if (err || !video) {
            console.log('DB add entities fail. ' + JSON.stringify(err));
            callback(err, video);
        }
        video.entities = entities;
        video.entTimestamp = Date.now();
        update(uuid, video, callback);
    });

};