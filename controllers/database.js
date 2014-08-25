var UUID = require("node-uuid"),
    monk = require('monk'),
    async = require('async');

var db = monk('localhost:27017/hyperted');

var videos = db.get('videos');
videos.index('uuid', {unique: true});
videos.index('locator', {unique: true});
videos.index('vendor vendor_id', {unique: true});

var ents = db.get('entities');
ents.index('uuid');
ents.index('extractor');

var hots = db.get('hotspots');
hots.index('uuid');

var chaps = db.get('chapters');
chaps.index('uuid');
chaps.index('uuid chapNum', {unique: true});

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
    chaps.find({'uuid': video.uuid}, { sort: { chapNum: 1 } }, function (err, docs) {
        if (!err && docs && docs.length > 0) {
            video.chapters = docs;
        }
        callback(false, video);
    });
}

function getVideoFromVendorId(vendor, id, callback) {
    if (!vendor || !id) {
        callback(true);
        return;
    }
    videos.findOne({'vendor': vendor, 'vendor_id': id}).on('complete', callback);
}
function getVideoFromLocator(locator, callback) {
    videos.findOne({locator: locator}).on('complete', callback);
}


function insertVideo(video, callback) {
    video.uuid = UUID.v4();
    video.timestamp = Date.now();
    callback = callback || function () {
    };
    var cb = callback, cbs = [];

    var previousCheck = function (next) {
        next()
    };
    if (video.vendor) {
        console.log('Check for existent vendor/id.');
        previousCheck = function (next) {
            getVideoFromVendorId(video.vendor, video.vendor_id, function (e, data) {
                if (e || !data) {
                    next();
                } else {
                    console.log('Video already in db.');
                    callback(e, data);
                }
            });
        }
    }
    previousCheck(function () {
    if (video.entities) {
        var entities = video.entities;
        delete video.entities;

        cbs.push(function (async_callback) {
            addEntities(video.uuid, entities, async_callback);
        });
    }

    if (video.chapters) {
        var chapters = video.chapters;
        delete video.chapters;

        cbs.push(function (async_callback) {
            addChapters(video.uuid, chapters, async_callback);
        });
    }

    if (cbs.length) {
        cb = function (err, data) {
            if (err) {
                callback(err, video);
                return;
            }
            async.parallel(cbs, function () {
                callback(err, video);
            });
        }
    }

    videos.insert(video, function (err, doc) {
        if (err) {
            console.log('DB insert fail. ' + JSON.stringify(err));
            videos.findOne({uuid: video.uuid}).on('complete', function (e, data) {
                if (!e && data) { //retry with another uuid
                    exports.insert(video, callback);
                } else {
                    cb(e, video);
                }
            });
        } else {
            cb(err, video);
        }
    });
    });
}

function updateVideoUuid(uuid, newVideo, callback) {
    callback = callback || function () {
    };
    var cb = callback, cbs = [];

    var entities;
    if (newVideo.entities) {
        entities = newVideo.entities;
        delete newVideo.entities;

        cbs.push(function (async_callback) {
            addEntities(uuid, entities, async_callback);
        });
    }
    var chapters;
    if (newVideo.chapters) {
        chapters = newVideo.chapters;
        delete newVideo.chapters;

        cbs.push(function (async_callback) {
            addChapters(uuid, chapters, async_callback);
        });
    }

    if (cbs.length) {
        cb = function (err, data) {
            if (entities)newVideo.entities = entities;
            if (chapters) newVideo.chapters = chapters;

            if (err) {
                console.log('DB updateVideoUuid fail. ' + err);
                callback(err, newVideo);
                return;
            }
            async.parallel(cbs, function () {
                callback(err, newVideo);
            });
        }
    }

    videos.findAndModify({uuid: uuid}, {$set:newVideo}, {upsert :true,new:true}, cb);
}

function addChapters(uuid, chapters, callback) {
    callback = callback || function () {
    };
    var funcArray = [];
    chapters.forEach(function (c) {
        c.uuid = uuid;
        var f = function (async_callback) {
            chaps.insert(c, async_callback);
        };
        funcArray.push(f)
    });
    async.parallel(funcArray, callback);
}

function addEntities(uuid, entities, callback) {
    callback = callback || function () {
    };
    var funcArray = [];
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
        var f = function (async_callback) {
            ents.findAndModify(eParams, {$set: e}, {upsert: true, new: true}, async_callback);
        };
        funcArray.push(f)
    });
    async.parallel(funcArray, callback);
}

module.exports = {
    getVideoFromUuid: getVideoFromUuid,
    getVideoFromLocator: getVideoFromLocator,
    getVideoFromVendorId: getVideoFromVendorId,
    insertVideo: insertVideo,
    updateVideoUuid: updateVideoUuid,
    updateVideo: function (newVideo, callback) {
        updateVideoUuid(newVideo.uuid, newVideo, callback);
    },
    addEntities: addEntities
};

module.exports.setHotspotProcess = function (uuid, value, callback) {
    videos.update({'uuid': uuid}, {$set: {'hotspotStatus': value}}, callback);
};
module.exports.getHotspotProcess = function (uuid, callback) {
    videos.findOne({'uuid': uuid}).on('complete', function (e, data) {
        if (data) callback(e, data.hotspotStatus);
        else callback({message: "video not in db"});
    });
};
module.exports.addHotspots = function (uuid, hotspots, callback) {
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


module.exports.forEachVideo=function(f){
            var videos = db.get('videos');
    videos.find({ timedtext: { $exists: true, $nin:[""]}, hotspotStatus:{ $exists: false}},{stream:true}).each(f).error(function(err){console.trace(err)});

}



module.exports.saveAbstracts = function(){
        var ents = db.get('entities');

    ents.find({ uri: { $exists: true, $nin:[""]}, abstract: { $exists: false}},{stream:true}).each(function(doc){
        console.log(doc.label);
        if(doc.uri){
            getDbpediaAbstract(doc.uri, function(err,abstract){
ents.updateById(doc._id, {'$set':{'abstract': abstract} }, function(err){
                        if(err)  console.trace(err);
                        console.log(doc.label + ' done');

})
            });
        }
    })  .error(function(err){console.trace(err)});


    function getDbpediaAbstract(wikiUrl, callback) {
        var http = require('http');
        var query = "select distinct ?res ?abstract where {" +
            "?res <http://xmlns.com/foaf/0.1/isPrimaryTopicOf> <" + wikiUrl + ">." +
            " ?res dbpedia-owl:abstract ?abstract" +
            " FILTER langMatches( lang(?abstract), 'en')" +
            "} LIMIT 100";

        var fullUrl = "http://dbpedia.org/sparql?query=" + query +
            "&format=json";

        http.getJSON(fullUrl, function (err, data) {
            if (err) {
                console.error(err);
                callback(err, data);
                return;
            }

            try {
                var abstract = data.results.bindings[0].abstract.value;
                callback(err, abstract)
            } catch (e) {
                console.error(e);
                callback(e);
            }
        });
    }

}