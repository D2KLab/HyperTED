var UUID = require("node-uuid"),
    monk = require('monk'),
    async = require('async');
var db, videos, ents, hots, chaps;


exports.prepare = function () {
    db = monk('localhost:27017/hyperted');

    videos = db.get('videos');
    videos.index('uuid', {unique: true});
    videos.index('locator', {unique: true});
    videos.index('vendor vendor_id', {unique: true});

    ents = db.get('entities');
    ents.index('uuid');
    ents.index('extractor');

    hots = db.get('hotspots');
    hots.index('uuid');

    chaps = db.get('chapters');
    chaps.index('uuid');

};

function getVideoFromUuid(uuid, full, callback) {
    var cb = !full ? callback : function (err, video) {
        if (err || !video) {
            callback(err, video);
            return;
        }
        async.parallel([
            function (asyncCallback) {
                getEntitiesFor(video, asyncCallback);
            },
            function (asyncCallback) {
                getHotspotsFor(video, asyncCallback);
            },
            function (asyncCallback) {
                getChaptersFor(video, asyncCallback);
            }
        ], function () {
            callback(false, video);
        });
    };
    videos.findOne({uuid: uuid}).on('complete', cb);
}

function getEntitiesFor(video, callback) {
    ents.find({'uuid': video.uuid}, function (err, docs) {
        if (!err && docs && docs.length > 0)
            video.entities = docs;

        callback(false, video);
    });
}

function getHotspotsFor(video, callback) {
    hots.find({'uuid': video.uuid}, function (err, docs) {
        if (!err && docs && docs.length > 0) {
            video.hotspots = docs;
        }
        callback(false, video);
    });
}

function getChaptersFor(video, callback) {
    chaps.find({'uuid': video.uuid},{ sort : { chapNum : 1 } }, function (err, docs) {
        if (!err && docs && docs.length > 0) {
            video.chapters = docs;
        }
        callback(false, video);
    });
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
    updateVideoUuid({uuid: newVideo.uuid}, newVideo, function (err, doc) {
        if (err) {
            console.log('DB updateVideoUuid fail. ' + JSON.stringify(err));
        }
        callback(err, doc);
    });
};

exports.addChapters = function (uuid, chapters, callback) {
    var e = false;
    chapters.forEach(function (c) {
        c.uuid = uuid;
        chaps.insert(c, function (err, doc) {
            if (err) {
                console.log(err);
                e = true;
            }
        });
    });
    callback(e);
};


function addEntities(uuid, entities) {
    entities.forEach(function (e) {
        e.uuid = uuid;

        var eParams = {
            'uuid': uuid,
            'extractor': e.extractor,
            'startNPT': e.startNPT,
            'endNPT': e.endNPT,
            'uri': e.uri,
            'label': e.label,
            'nerdType': e.nerdType
        };
        ents.findAndModify(eParams, {$set: e}, {upsert: true, new: true}, function (err, newDoc) {
            if (err)
                console.log(err);
        });

    });
}
exports.addEntities = addEntities;

exports.setHotspotProcess = function (uuid, value, callback) {
    videos.update({'uuid': uuid}, {$set: {'hotspotStatus': value}}, callback);
};
exports.getHotspotProcess = function (uuid, callback) {
    videos.findOne({'uuid': uuid}).on('complete', function (e, data) {
        if (data) callback(e, data.hotspotStatus);
        else callback({message: "video not in db"});
    });
};
exports.addHotspots = function (uuid, hotspots, callback) {
    var e = false;
    hotspots.forEach(function (h) {
        h.uuid = uuid;
        hots.insert(h, function (err, doc) {
            if (err) {
                console.log(err);
                e = true;
            }
        });
    });
    callback(e);
};