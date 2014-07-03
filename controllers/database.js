var UUID = require("node-uuid"),
    monk = require('monk');
var db, videos, ents;


exports.prepare = function () {
    db = monk('localhost:27017/hyperted');

    videos = db.get('videos');
    videos.index('uuid', {unique: true});
    videos.index('locator', {unique: true});
    videos.index('vendor vendor_id', {unique: true});

    ents = db.get('entities');
    ents.index('uuid');
    ents.index('extractor');
};

function getVideoFromUuid(uuid, withEntities, callback) {
    var cb = !withEntities ? callback : function (err, video) {
        if (err || !video) {
            callback(err, video);
            return;
        }

        ents.find({'uuid': uuid}, function (err, docs) {
            if (!err && docs && docs.length > 0) {
                video.entities = docs;
            }
            callback(false, video);
        });
    };

    videos.findOne({uuid: uuid}).on('complete', cb);
}
exports.getVideoFromUuid = getVideoFromUuid;

exports.getVideoFromLocator = function (locator, callback) {
    videos.findOne({locator: locator}).on('complete', callback);
};
exports.getVideoFromVendorId = function (vendor, id, callback) {
    if (!vendor || !id) {
        callback(true);
        return;
    }
    videos.findOne({'vendor': vendor, 'vendor_id': id}).on('complete', callback);
};

exports.insertVideo = function (video, callback) {
    video.uuid = UUID.v4();
    video.timestamp = Date.now();
    var callback = callback || function () {
    };
    var cb = callback;

    var entities;
    if (video.entities) {
        entities = video.entities;
        delete video.entities;

        cb = function (err, video) {
            if (err || !video) {
                callback(err, video);
                return;
            }
            addEntities(video.uuid, entities);
        }
    }

    videos.insert(video, function (err, doc) {
        if (err) {
            console.log('DB insert fail. ' + JSON.stringify(err));
            console.log('Check for existent uuid.');
            videos.findOne({uuid: video.uuid}).on('complete', function (e, data) {
                if (!e && data) { //retry with another uuid
                    exports.insert(video, callback);
                } else {
                    cb(e, data);
                }
            });
        } else {
            cb(err, doc);
        }
    });
};

function updateVideoUuid(uuid, newVideo, callback) {
    videos.update({uuid: uuid}, newVideo, function (err, doc) {
        if (err) {
            console.log('DB updateVideoUuid fail. ' + JSON.stringify(err));
        }
        callback(err, doc);
    });
}
exports.updateVideoUuid = updateVideoUuid;

exports.updateVideo = function (newVideo, callback) {
    videos.updateVideoUuid({uuid: newVideo.uuid}, newVideo, function (err, doc) {
        if (err) {
            console.log('DB updateVideoUuid fail. ' + JSON.stringify(err));
        }
        callback(err, doc);
    });
};


function addEntities(uuid, entities) {
    entities.forEach(function (e) {
        e.uuid = uuid;

        var eParams = {
            'uuid': uuid,
            'extractor': e.extractor,
            'startNPT': e.startNPT,
            'endNPT': e.endNPT
        };
        ents.findAndModify(eParams, {$set: e}, {upsert: true, new: true}, function (err, newDoc) {
            if (err)
                console.log(err);
        });

    });
}
exports.addEntities = addEntities;