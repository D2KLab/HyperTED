var http = require('http'),
    url = require("url"),
    async = require('async'),
    optional = require('optional'),
    domain = require('domain'),
    moment = require('moment'),
    ffprobe = optional('node-ffprobe'),
    mfParser = require('mediafragment'),
    elasticsearch = require('elasticsearch'),
    nerd = require('./nerdify'),
    db = require('./database'),
    ts = require('./linkedTVconnection'),
    courseSuggestion = require('./course_suggestion'),
    errorMsg = require('./error_msg'),
    utils = require('./utils');

var LOG_TAG = '[VIDEO.JS]: ';
var hStatusValue = {
    'IN_PROGRESS': 1,
    'DONE': 2
};

var client = new elasticsearch.Client({
    host: 'localhost:9200',
    log: 'trace'
});

var time1d = 86400000; //one day
var time1w = 7 * time1d; //one week
ts.prepare();

var mergeObj = utils.mergeObj;

/*
 * Prepare and render a video already in db
 */
function viewVideo(req, res, video) {
    var enriched = req.query.enriched;
    var videoURI = video.videoLocator || video.locator;

    // Identify the media fragment part
    var mf = mfParser.parse(req.url);
    if (mf.toUrlString()) {
        var concSign = url.parse(videoURI).hash ? '&' : '#';
        videoURI += concSign + mf.toUrlString().substr(1);
    }

    var options = {
        videoURI: videoURI,
        enriched: enriched
    };

    // Prepare nerd entity part
    if (!enriched || !video.timedtext) {
        // enrichment is not requested or we can not enrich
        renderVideo(res, video, options);
    } else if (video.entities && containsExtractor(video.entities, enriched)) {
        // we have already enriched with this extractor
        video.entities = video.entities.filter(hasExtractor, enriched);
        renderVideo(res, video, options);
    } else {
        // we have to retrive entities from NERD
        getEntities(video, enriched, function (err, data) {
            if (err) {
                console.log(LOG_TAG + 'error in getEntity: ' + err.message);
                options.error = "Sorry. We are not able to retrieving NERD entities now.";
            } else {
                video.entities = data;
            }
            renderVideo(res, video, options);
        });
    }
}

function renderVideo(res, video, options) {
    if (video.timedtext) {
        video.subtitles = srtToJson(video.timedtext, video.chapters);
    }
    if (video.hotspots) {
        var topicList = [];
        video.hotspots.forEach(function (hs) {
            hs.topic_list.forEach(function (topic) {
                topicList.push(topic);
            })
        });
        courseSuggestion.getSuggestedCouses(topicList, function (err, courses) {
            if (!err && courses && courses.length) {
                video.courses = courses;
            }
            var source = mergeObj(video, options);
            res.render('video.ejs', source);
        })
    } else {
        var source = mergeObj(video, options);
        res.render('video.ejs', source);
    }
}

exports.view = function (req, res) {
    var uuid = req.param('uuid');
    if (!uuid) {
        res.render('error.ejs', errorMsg.e400);
        return;
    }
    db.getVideoFromUuid(uuid, true, function (err, video) {
        if (err || !video) {
            res.render('error.ejs', errorMsg.e404);
            return;
        }

        var updateFun = function (video, callback) {
            // fake function
            callback(false, video);
        };

        if (!video.timestamp || Date.now() - video.timestamp > time1w) {
            //UPDATE ALL METADATA
            console.log("updating metadata for video " + uuid);
            video.timestamp = Date.now();
            updateFun = collectMetadata;
        } else if (video.vendor) {
            updateFun = getFickleMetadata;
        }

        updateFun(video, function (err, video) {
            db.updateVideoUuid(uuid, video, function (err, data) {
                if (err) {
                    console.log("DATABASE ERROR");
                    console.log(err);
                    console.log("Can not updateVideoUuid");
                }

                if (video.hotspotStatus == hStatusValue.IN_PROGRESS) {
                    checkHotspotResults(video.uuid, function (err, data) {
                        if (data) {
                            video.hotspotStatus = hStatusValue.DONE;
                            video.hotspots = data;
                        }
                        viewVideo(req, res, video);
                    });
                } else {
                    viewVideo(req, res, video);
                }
            });
        });

    });
};

exports.search = function (req, resp) {
    var videoURI = req.query.uri;
    if (!videoURI) {
        console.log(LOG_TAG + 'No specified video uri.');
        resp.redirect('/');
        return;
    }
    var parsedURI = url.parse(videoURI, true);
    var locator = parsedURI.protocol + '//' + parsedURI.host + parsedURI.pathname;
    var fragPart = '', separator = '?', fragSeparator = '?';

    for (var k in parsedURI.query) {
        var parsedQueryUnit = k + '=' + parsedURI.query[k];
        if (k == 't' || k == 'xywh' || k == 'track' || k == 'id' || k == 'enriched') {
            fragPart += fragSeparator + parsedQueryUnit;
            fragSeparator = '&';
        } else {
            locator += separator + parsedQueryUnit;
            separator = '&';
        }
    }

    for (var j in req.query) {
        if (j == 'uri') continue;
        var queryUnit = j + '=' + req.query[j];
        fragPart += fragSeparator + queryUnit;
    }
    var hashPart = parsedURI.hash || '';

    if (parsedURI.hostname = 'stream17.noterik.com') {
        locator = locator.replace(/rawvideo\/[0-9]\/raw.mp4/, '');
        locator = locator.replace(/\?ticket=.+/, '');
    }

    db.getVideoFromLocator(locator, function (err, data) {
        if (err) { //db error
            console.log("DATABASE ERROR");
            console.log(err);
            resp.render('error.ejs', errorMsg.e500);
            return;
        }

        if (data) { //video in db
            var redirectUrl = '/video/' + data.uuid + fragPart + hashPart;
            console.log('Video at ' + locator + ' already in db.');
            console.log('Redirecting to ' + redirectUrl);
            resp.redirect(redirectUrl);
            return;
        }

        var vendor = detectVendor(locator);
        var id = detectId(locator, vendor);

        db.getVideoFromVendorId(vendor, id, function (err, data) {
            if (!err && data) {
                var redirectUrl = '/video/' + data.uuid + fragPart + hashPart;
                console.log('Video at ' + locator + ' already in db.');
                console.log('Redirecting to ' + redirectUrl);
                resp.redirect(redirectUrl);
                return;
            }

            //new video
            console.log(LOG_TAG + 'Preparing metadata for adding to db');
            var video = {locator: locator};
            if (vendor && id) {
                video.vendor = vendor;
                video.vendor_id = id;
            }
            if (locator.indexOf('http://stream17.noterik.com/') >= 0) {
                video.videoLocator = locator + '/rawvideo/2/raw.mp4?ticket=77451bc0-e0bf-11e3-8b68-0800200c9a66';
            }

            collectMetadata(video, function (err, video) {

                // write in db
                db.insertVideo(video, function (err, data) {
                    if (err || !data) {
                        console.log("DATABASE ERROR" + JSON.stringify(err));
                        resp.render('error.ejs', errorMsg.e500);
                        return;
                    }
                    var redirectUrl = '/video/' + data.uuid + fragPart + hashPart;
                    console.log('Video at ' + locator + ' successfully added to db.');
                    console.log('Redirecting to ' + redirectUrl);
                    resp.redirect(redirectUrl);
                });
            });
        });
    });
};

/*
 * Called on click on "Nerdify" button
 *
 * Generate an html in response.
 */
exports.nerdify = function (req, res) {
    var uuid = req.query.uuid;
    var ext = req.query.enriched;

    db.getVideoFromUuid(uuid, true, function (err, video) {
        if (!video) {
            console.log("Error from DB");
            res.json({error: "Error from DB"});
            return;
        }
        if (video.entities && containsExtractor(video.entities, ext)) {
            // we have already enriched with this extractor
            var entities = video.entities.filter(hasExtractor, ext);
            res.json(entities);
            video.enriched = ext;
//            res.render('nerdify_resp.ejs', video);
        } else {
            console.log(LOG_TAG + 'nerdifying ' + uuid);
            getEntities(video, ext, function (err, data) {
                if (err) {
                    console.log(LOG_TAG + err.message);
                    res.json({error: "Error from NERD"});
                    return;
                }

                res.json(data);
//                video.entities = data;
                video.enriched = ext;
//                res.render('nerdify_resp.ejs', video);
            });
        }
    });
};

/*
 * Collect metadata form all sources.
 * Used for new video (search)
 */
function collectMetadata(video, callback) {
    // 1. search for metadata in sparql
    getMetadataFromSparql(video, function (err, data) {
        if (err || !data) {
            console.log("No data obtained from sparql");
        } else {
            video = mergeObj(video, data);
            if (data.chapters) {
                var chapters = [];
                for (var c in video.chapters) {
                    if (!video.chapters.hasOwnProperty(c))
                        continue;
                    var cur_chap = video.chapters[c];
                    // hypothesis: chapter timing is in seconds
                    var chap = {
                        source: 'data.linkedtv.eu',
                        startNPT: cur_chap.tStart.value,
                        endNPT: cur_chap.tEnd.value,
                        chapNum: c,
                        uuid: data.uuid,
                        chapterUri: cur_chap.chapter.value,
                        mediaFragmentUri: cur_chap.mediafragment.value
                    };
                    chapters.push(chap);
                }
                video.chapters = chapters;
            }
        }

        //2. search metadata with vendor's api
        getMetadata(video, function (err, metadata) {
            if (err) {
                console.log(LOG_TAG + 'Metadata retrieved with errors.');
            }
            if (!metadata) {
                console.log(LOG_TAG + 'Metadata unavailable.');
            } else {
                video.metadata = metadata;
            }

            callback(err, video);
        });
    });
}

function getEntities(video, ext, callback) {
    console.log('nerdifing video ' + video.uuid + ' with ' + ext);
    var doc_type, text;
    if (video.timedtext) {
        doc_type = 'timedtext';
        text = video.timedtext;
    } else {
        doc_type = 'text';
        text = video.metadata.descr;
    }
    nerd.getEntities(doc_type, text, ext, function (err, data) {
        if (!err && data) {
            if (ext == 'combined') {
                for (var i = 0; i < data.length; i++) {
                    data[i].source = 'combined';
                }
            }

            db.addEntities(video.uuid, data);
        }

        callback(err, data);
    });
}

function getMetadataFromSparql(video, callback) {
    ts.getVideoFromLocator(video.locator, function (err, data) {
        if (err || !data) {
            callback(err, data);
            return;
        }
        var sparql_data = data;
        getSubtitlesTV2RDF(sparql_data.ltv_uuid, function (err, data) {
            if (err || !data) {
                console.log("No sub obtained from sparql");
                callback(false, sparql_data);
                return;
            }
            sparql_data.timedtext = data;
            callback(err, sparql_data);
        });
    });
}

function getMetadata(video, callback) {
    if (!video.vendor || !video.vendor_id) {
        callback({'message': 'Not vendor or id available'});
        return;
    }
    var metadata = video.metadata || {};
    var vendor = vendors[video.vendor];
    var metadata_url = vendor.metadata_url.replace('<id>', video.vendor_id);

    function onErrorMetadataJson(err, metadata_url, callback) {
        console.log('[ERROR] on retrieving metadata from ' + metadata_url);
        callback(err);
    }

    switch (vendor.name) {
        case 'youtube':
            async.parallel([
                function (async_callback) {
                    //retrieve metadata
                    http.getJSON(metadata_url, function (err, data) {
                        if (err) {
                            onErrorMetadataJson(err, metadata_url, async_callback);
                            return;
                        }
                        metadata.title = data.entry.title.$t;
                        metadata.thumb = data.entry.media$group.media$thumbnail[0].url;
                        metadata.descr = data.entry.media$group.media$description.$t.replace(new RegExp('<br />', 'g'), '\n');
                        metadata.views = data.entry.yt$statistics.viewCount;
                        metadata.favourites = data.entry.yt$statistics.favoriteCount;
                        metadata.comments = data.entry.gd$comments ? data.entry.gd$comments.gd$feedLink.countHint : 0;
                        metadata.likes = data.entry.yt$rating ? data.entry.yt$rating.numLikes : 0;
                        metadata.avgRate = data.entry.gd$rating ? data.entry.gd$rating.average : 0;
                        metadata.published = data.entry.published.$t;
                        metadata.category = data.entry.category[1].term;
                        async_callback(false);
                    });
                },
                function (async_callback) {
                    // retrieve sub
                    var subUrl = vendor.sub_url.replace('<id>', video.vendor_id);
                    http.getRemoteFile(subUrl, function (err, data) {
                        if (err) {
                            console.log('[ERROR] on retrieving sub for ' + video.locator);
                        } else {
                            video.timedtext = data;
                        }
                        async_callback(false);
                    });
                }
            ], function (err) {
                callback(err, metadata);
            });
            break;
        case 'dailymotion':
            async.parallel([
                function (async_callback) {
                    http.getJSON(metadata_url, function (err, data) {
                        if (err) {
                            onErrorMetadataJson(err, metadata_url, async_callback);
                            return;
                        }
                        metadata.title = data.title;
                        metadata.thumb = data.thumbnail_60_url;
                        metadata.descr = data.description.replace(new RegExp('<br />', 'g'), '\n');
                        metadata.views = data.views_total;
                        metadata.favourites = data.bookmarks_total;
                        metadata.comments = data.comments_total;
                        metadata.likes = data.ratings_total;
                        metadata.avgRate = data.rating;
                        metadata.published = '' + moment.unix(data.created_time).format("YYYY-MM-DD");
                        metadata.category = data.genre;
                        async_callback(false);

                    })
                },
                function (async_callback) {
                    //retrieve sub
                    var subListUrl = vendor.sub_list_url.replace('<id>', video.vendor_id);
                    console.log('retrieving sub list from ' + subListUrl);
                    http.getJSON(subListUrl, function (err, data) {
                        if (err) {
                            console.log('[ERROR] on retrieving sub for ' + video.locator);
                            async_callback(false);
                        } else if (data.total <= 0) {
                            console.log('no sub available');
                            async_callback(false);
                        } else {
                            var subUrl = (data.list[0].url);
                            http.getRemoteFile(subUrl, function (err, data) {
                                if (err) {
                                    console.log('[ERROR] on retrieving sub for ' + video.locator);
                                } else {
                                    video.timedtext = data;
                                }
                                async_callback(false);
                            });
                        }
                    });
                }
            ], function (err) {
                callback(err, metadata);
            });
            break;
        case 'vimeo':
            http.getJSON(metadata_url, function (err, data) {
                if (err) {
                    onErrorMetadataJson(err, metadata_url, callback);
                    return;
                }
                metadata.title = data.title;
                metadata.thumb = data.thumbnail_small;
                metadata.descr = data.description.replace(new RegExp('<br />', 'g'), '\n');
                metadata.views = data.stats_number_of_plays;
                metadata.favourites = "n.a.";
                metadata.comments = data.stats_number_of_comments;
                metadata.likes = data.stats_number_of_likes;
                metadata.avgRate = "n.a.";
                metadata.published = data.upload_date;
                metadata.category = data.tags;
                callback(err, metadata);
            });
            break;
        case 'ted':
            http.getJSON(metadata_url, function (err, data) {
                if (err) {
                    onErrorMetadataJson(err, metadata_url, callback);
                    return;
                }
                var datatalk = data.talk;
                video.videoLocator = (datatalk.media.internal ? datatalk.media.internal['950k'] || datatalk.media.internal['600k'] : datatalk.media.external).uri;
                video.vendor_id = String(datatalk.id);
                metadata.title = datatalk.name;
                if (datatalk.images) {
                    metadata.thumb = datatalk.images[1].image.url;
                    metadata.poster = datatalk.images[2].image.url;
                }
                metadata.descr = datatalk.description.replace(new RegExp('<br />', 'g'), '\n');
                metadata.views = datatalk.viewed_count;
                metadata.comments = datatalk.commented_count;
                metadata.published = datatalk.published_at;
                metadata.event = datatalk.event.name;

                var subUrl = vendors['ted'].sub_url.replace('<id>', video.vendor_id);

                async.parallel([
                        function (async_callback) {
                            http.getJSON(subUrl, function (err, data) {
                                if (err) {
                                    console.log('[ERROR ' + err + '] on retrieving sub for ' + video.locator);
                                } else video.jsonSub = data;

                                async_callback(err, data);
                            });
                        },
                        function (async_callback) {
                            // get video duration
                            if (ffprobe) {
                                var d = domain.create();
                                d.on('error', function (err) {
                                    console.warn('' + err);
                                    console.warn("Maybe you have not installed ffmpeg or ffmpeg is not in your \"Path\" Environment variable.");
//                                    async_callback(false);
                                });
                                d.run(function () {
                                    ffprobe(video.videoLocator, function (err, probeData) {
                                        if (err) {
                                            console.log(err);
                                            return;
                                        }
                                        if (probeData && probeData.format) {
                                            video.duration = probeData.format.duration;
                                        }
                                        async_callback(false)
                                    });
                                });
                            }
                        }
                    ],
                    function (err) {
                        if (!err) {
                            video.chapters = getTedChapters(video.jsonSub, video.duration)
                            video.timedtext = jsonToSrt(video.jsonSub);
                        }
                        callback(false, metadata);
                    });
            });
            break;
        default:
            callback(true, 'Vendor undefined or not recognized');
    }
}

/*
 * Retrieve the part of metadata that change constantly
 * (i.e. #views, #likes,...)
 */
function getFickleMetadata(video, callback) {
    if (!video.vendor || !video.vendor_id) {
        callback({'message': 'Not vendor or id available'});
        return;
    }
    var metadata = video.metadata || {};
    var vendor = vendors[video.vendor];
    var metadata_url = vendor.metadata_url.replace('<id>', video.vendor_id);

    function onErrorMetadataJson(err, metadata_url) {
        console.log('[ERROR] on retrieving metadata from ' + metadata_url);
        callback(err, video);
    }

    function onSuccessMetadataJson(err, metadata) {
        if (metadata)
            video.metadata = metadata;
        callback(err, video);
    }

    switch (vendor.name) {
        case 'youtube':
            http.getJSON(metadata_url, function (err, data) {
                if (err) {
                    onErrorMetadataJson(err, metadata_url);
                    return;
                }
                metadata.title = data.entry.title.$t;
                metadata.thumb = data.entry.media$group.media$thumbnail[0].url;
                metadata.descr = data.entry.media$group.media$description.$t.replace(new RegExp('<br />', 'g'), '\n');
                metadata.views = data.entry.yt$statistics.viewCount;
                metadata.favourites = data.entry.yt$statistics.favoriteCount;
                metadata.comments = data.entry.gd$comments ? data.entry.gd$comments.gd$feedLink.countHint : 0;
                metadata.likes = data.entry.yt$rating ? data.entry.yt$rating.numLikes : 0;
                metadata.avgRate = data.entry.gd$rating ? data.entry.gd$rating.average : 0;
                metadata.published = data.entry.published.$t;
                metadata.category = data.entry.category[1].term;

                onSuccessMetadataJson(err, metadata);
            });
            break;
        case 'dailymotion':
            http.getJSON(metadata_url, function (err, data) {
                if (err) {
                    onErrorMetadataJson(err, metadata_url);
                    return;
                }
                metadata.title = data.title;
                metadata.thumb = data.thumbnail_60_url;
                metadata.descr = data.description.replace(new RegExp('<br />', 'g'), '\n');
                metadata.views = data.views_total;
                metadata.favourites = data.bookmarks_total;
                metadata.comments = data.comments_total;
                metadata.likes = data.ratings_total;
                metadata.avgRate = data.rating;
                metadata.published = '' + moment.unix(data.created_time).format("YYYY-MM-DD");
                metadata.category = data.genre;
                onSuccessMetadataJson(err, metadata);
            });
            break;
        case 'vimeo':
            http.getJSON(metadata_url, function (err, data) {
                if (err) {
                    onErrorMetadataJson(err, metadata_url);
                    return;
                }
                metadata.title = data.title;
                metadata.thumb = data.thumbnail_small;
                metadata.descr = data.description.replace(new RegExp('<br />', 'g'), '\n');
                metadata.views = data.stats_number_of_plays;
                metadata.favourites = "n.a.";
                metadata.comments = data.stats_number_of_comments;
                metadata.likes = data.stats_number_of_likes;
                metadata.avgRate = "n.a.";
                metadata.published = '' + data.upload_date;
                metadata.category = data.tags;
                onSuccessMetadataJson(err, metadata);
            });
            break;
        case 'ted':
            http.getJSON(metadata_url, function (err, data) {
                if (err) {
                    onErrorMetadataJson(err, metadata_url);
                    return;
                }
                var datatalk = data.talk;
                video.videoLocator = (datatalk.media.internal ? datatalk.media.internal['950k'] || datatalk.media.internal['600k'] : datatalk.media.external).uri;
                video.vendor_id = String(datatalk.id);
                metadata.title = datatalk.name;
                if (datatalk.images) {
                    metadata.thumb = datatalk.images[1].image.url;
                    metadata.poster = datatalk.images[2].image.url;
                }
                metadata.descr = datatalk.description.replace(new RegExp('<br />', 'g'), '\n');
                metadata.views = datatalk.viewed_count;
                metadata.comments = datatalk.commented_count;
                metadata.published = datatalk.published_at;
                metadata.event = datatalk.event.name;

                onSuccessMetadataJson(err, metadata);
            });
            break;
        default:
            callback(true, 'Vendor undefined or not recognized');
    }
}

exports.ajaxGetMetadata = function (req, res) {
    var uuid = req.param('uuid');
    if (!uuid) {
        res.json({error: 'empty uuid'});
        return;
    }

    db.getVideoFromUuid(uuid, false, function (err, data) {
        if (err || !data) {
            res.json({error: 'video not found in db'});
            return;
        }
        if (data.metadata) {
            res.json(data.metadata)
        } else {
            res.json({});
        }
    });

};

exports.filterEntities = function (req, res) {
    var uuid = req.param('uuid');
    var startMF = req.param('startMFFilt');
    if (!uuid) {
        res.json({error: 'empty uuid'});
        return;
    }

    db.getFilterEntities(uuid, req.param('extractor'), startMF, req.param('endMFFilt'), function (err, doc) {
        if (err)
            res.json({error: 'db error'});
        else {
            doc.sort(
                /**
                 * @return {number}
                 */
                    function SortByRelevance(x, y) {
                    return ((x.relevance == y.relevance) ? 0 : ((x.relevance < y.relevance) ? 1 : -1 ));
                });
            var lab = "";
            for (var i in doc) {
                lab = lab.concat(doc[i].label, '&');
            }
            var filtered = lab.substring(0, lab.length - 1);
            suggestMF(filtered, function (err, resp) {
                if (err)
                    res.send(err.message, 500);
                else {
                    checkMF(resp, function (err, vids) {
                        if (err)
                            res.send(err.message, 500);
                        else {
                            if (vids[uuid]) {
                                for (var c in vids[uuid]) {
                                    if (vids[uuid][c].startNPT == startMF) {
                                        vids[uuid].splice(c);
                                    }
                                }
                                if (!vids[uuid].length)
                                    delete vids[uuid];
                            }
                            res.json({"results": vids});
                        }

                    })

                }
            });

        }

    })

};

function suggestMF(search, callback) {
    client.search({
            index: 'ent_index',
            type: 'entity',
            body: {
                from: 0, size: 20,
                query: {
                    multi_match: {
                        query: search,
                        fields: ["label", "abstract", "uri^4"]

                    }
                }
            }
        }
    ).then(function (resp) {
            var hits = resp.hits.hits;
            callback(null, hits);
        }, function (err) {
            console.trace(err.message);
            callback(err);
        });
}
exports.suggestMF = suggestMF;

function checkMF(json, callback) {
    var chapters = [], functs = [];


    json.forEach(function (ent) { // entity
        var uuid = ent._source.uuid;
        var st = ent._source.startNPT;
        var f = function (async_callback) {
            db.getChaptersAtTime(st, uuid, function (err, ch) {
                chapters.push(ch);
                async_callback();
            });
        };

        functs.push(f);

    });


    async.parallel(functs, function (err) {
        if (err)callback(err);
        else {
            var suggested = {};
            chapters.forEach(function (c) {
                if (!c)return;
                var v1 = suggested[c.uuid];
                if (v1) {
                    var notExists = v1.every(function (ch) {
                        return ch.chapNum != c.chapNum;
                    });
                    if (notExists) v1.push(c);
                    return;
                }
                v1 = [c];
                suggested[c.uuid] = v1;
            });
            callback(null, suggested);
        }
    });


}

function getSubtitlesTV2RDF(uuid, callback) {
    http.getRemoteFile('http://linkedtv.eurecom.fr/tv2rdf/api/mediaresource/' + uuid + '/metadata?metadataType=subtitle', callback);
}

function getTedChapters(json, totDuration) {
    var cur_chap = {"startNPT": 0,
        "source": 'api.ted.com',
        "chapNum": 0};
    var cursub;
    var chapters = [];
    var chapNum = 1;
    var sub_offset = json._meta.preroll_offset;

    var oldkey = 0;
    for (var key in json) {
        if (json.hasOwnProperty(key) && key != '_meta') {
            cursub = json[key].caption;

            var isStartOfChap = cursub.startOfParagraph;
            if (isStartOfChap) {
                var sub_startTime = cursub.startTime;
                var thisChapStart = (sub_offset + sub_startTime) / 1000;
                cur_chap.endNPT = thisChapStart;
                chapters.push(cur_chap);

                if (parseInt(key) == parseInt(oldkey) + 1) {
                    chapters.pop();
                } else {
                    cur_chap = {
                        "startNPT": thisChapStart,
                        "source": 'api.ted.com',
                        "chapNum": chapNum
                    };
                    ++chapNum;
                }
                oldkey = key;
            }
        }
    }
    var lasSubEnd = (sub_offset + cursub.startTime + cursub.duration) / 1000;
    cur_chap.endNPT = totDuration ? totDuration : lasSubEnd;
    chapters.push(cur_chap);
    return chapters;
}

/*
 * This function translate subtitles from TED json to srt
 * */
function jsonToSrt(json) {
    var mysrt = '';
    var sub_offset = json._meta.preroll_offset;

    for (var key in json) {
        if (json.hasOwnProperty(key) && key != '_meta') {
            var sub = json[key].caption;
            var sub_startTime = sub.startTime;
            var sub_duration = sub.duration;
            var sub_content = sub.content;

            var newStart = (sub_offset + sub_startTime) / 1000;
            var end = newStart + (sub_duration / 1000);

            mysrt += ++key + '\n' + subTime(newStart) + ' --> ' + subTime(end) + '\n' + sub_content + '\n\n';
        }
    }
    return encodeUTF(mysrt);
}

/* from srt to a json ready to be used in render */
function srtToJson(srt, chapters) {
    var strList = srt.split('\n\n'), subList = [];
    if (strList.length < 2) {
        strList = srt.substr(1).split('\n\r');
    }
    var charIndex = -1;

    function calcTime(subTime) {
        var time = (subTime.split(":"));
        var hh = parseInt(time[0]);
        var mm = parseInt(time[1]);
        var ss = parseFloat(time[2].replace(",", "."));

        return ((mm * 60) + (hh * 3600) + ss);
    }

    for (var index in strList) {
        if (!strList.hasOwnProperty(index))continue;

        var sub = {text: '', lineNum: 0};
        var lines = strList[index].split('\n');

        for (var l in lines) {
            if (!lines.hasOwnProperty(l))continue;
            var line = lines[l];
            if (!sub.id) {
                sub.id = line.trim();
            } else if (!sub.time) {
                sub.time = line.replace('\r', '');
                var timeSplit = sub.time.split(' --> ');
                var subStart = calcTime(timeSplit[0]);
                sub.startSS = Math.round(subStart * 1000) / 1000;
                var subEnd = calcTime(timeSplit[1]);
                sub.endSS = Math.round(subEnd * 1000) / 1000;
            } else {
                var start = sub.lineNum > 0 ? '\n' : '';
                sub.text += start + line;
                sub.lineNum++;
            }
        }

        sub.startChar = charIndex + 1;
        charIndex = sub.startChar + sub.text.length; //because of a '\n' is a fake double char
        sub.endChar = charIndex;
        if (sub.id)
            subList.push(sub);
    }

    if (chapters) {
        var subIndex = 0;

        for (var k in chapters) {
            if (!chapters.hasOwnProperty(k))continue;

            var chap = chapters[k];
            var chapStart, chapEnd;
            if (chap.tStart) {
                chapStart = Math.round(chap.tStart.value);
                chapEnd = Math.round(chap.tEnd.value);
            } else {
                chapStart = chap.startNPT;
                chapEnd = chap.endNPT;
            }

            while (subIndex < subList.length) {
                var thisSub = subList[subIndex];
                thisSub.chapNum = k;
                if (!thisSub.id || thisSub.id == "") {
                    ++subIndex;
                } else {
                    var sEnd = thisSub.endSS;
                    if (chapStart > sEnd) {
                        //chapter not yet started: go next sub
                        subIndex++;
                    } else if (chapStart <= sEnd && chapEnd >= sEnd) {
                        //we are in a chapter: save this info and go next sub
//                                        thisSub.dataChap = ' data-chapter=' + c.chapter.value.replace("http://data.linkedtv.eu/chapter/", "");
                        thisSub.dataChap = ' data-chapter=' + k;
                        subIndex++;
                    } else {
                        //chapter ends: go next chapter
                        if (subIndex > 0) {
                            subList[subIndex - 1].endChap = true;
                        }
                        break;
                    }
                }
            }

        }
        subList[subList.length - 1].endChap = true;
    }


    return subList;
}

// TODO sistemare
function subTime(time) {
    var fTime;
    if (time < 60) {
        fTime = (time > 9) ? "00:00:" + time.toFixed(3) : "00:00:0" + time.toFixed(3);
    } else if (time == 60 || time > 60 && time < 3600) {
        var min = Math.floor(time / 60);
        var sec = (time % 60).toFixed(3);
        fTime = (min > 9 && sec > 9) ? "00:" + min + ":" + sec : (min < 9 && sec > 9) ? "00:0" + Math.floor(time / 60) + ":" + sec : (min > 9 && sec < 9) ? "00:" + Math.floor(time / 60) + ":0" + sec : "00:0" + min + ":0" + sec;
    }
    else {
        var sec = ((time % 3600) % 60).toFixed(3);
        fTime = (sec > 9) ? Math.floor(time / 3600) + ":" + Math.floor((time % 3600) / 60) + ":" + sec : Math.floor(time / 3600) + ":" + Math.floor((time % 3600) / 60) + ":0" + sec;
    }

    return fTime.replace(/\./g, ',');
}

// public method for url encoding
function encodeUTF(string) {
    string = string.replace(/\r/g, '');
    var utftext = "";

    for (var n = 0; n < string.length; n++) {

        var c = string.charCodeAt(n);

        if (c < 128) {
            utftext += String.fromCharCode(c);
        }
        else if ((c > 127) && (c < 2048)) {
            utftext += String.fromCharCode((c >> 6) | 192);
            utftext += String.fromCharCode((c & 63) | 128);
        }
        else {
            utftext += String.fromCharCode((c >> 12) | 224);
            utftext += String.fromCharCode(((c >> 6) & 63) | 128);
            utftext += String.fromCharCode((c & 63) | 128);
        }

    }

    return utftext;
}

// public method for url decoding
function decodeUTF(utftext) {
    var string = "";
    var i = 0;
    var c = c1 = c2 = 0;

    while (i < utftext.length) {

        c = utftext.charCodeAt(i);

        if (c < 128) {
            string += String.fromCharCode(c);
            i++;
        }
        else if ((c > 191) && (c < 224)) {
            c2 = utftext.charCodeAt(i + 1);
            string += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
            i += 2;
        }
        else {
            c2 = utftext.charCodeAt(i + 1);
            c3 = utftext.charCodeAt(i + 2);
            string += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
            i += 3;
        }

    }

    return string;
}

var vendors = {
    'youtube': {
        name: 'youtube',
        url_pattern: /(youtu.be\/|youtube.com\/(watch\?(.*&)?v=|(embed|v)\/))([^\?&\"\'>]+)/,
        metadata_url: 'http://gdata.youtube.com/feeds/api/videos/<id>?v=2&alt=json-in-script',
        sub_url: 'http://www.youtube.com/api/timedtext?lang=en&format=srt&v=<id>'
    },
    'dailymotion': {
        name: 'dailymotion',
        url_pattern: /dailymotion.com\/(video|hub)\/([^_]+)/,
        metadata_url: 'https://api.dailymotion.com/video/<id>?fields=title,thumbnail_60_url,description,views_total,bookmarks_total,comments_total,ratings_total,rating,created_time,genre',
        sub_list_url: 'https://api.dailymotion.com/video/<id>/subtitles?fields=id,language%2Curl'
    },
    'vimeo': {
        name: 'vimeo',
        url_pattern: /(www.)?(player.)?vimeo.com\/([a-z]*\/)*([0-9]{6,11})[?]?.*/,
        metadata_url: 'http://vimeo.com/api/v2/video/<id>.json'
    },
    'ted': {
        name: 'ted',
        url_pattern: /^https?:\/\/(?:www\.)?ted\.com\/talks\/*([^?]+)/,
        metadata_url: 'https://api.ted.com/v1/talks/<id>.json?api-key=uzdyad5pnc2mv2dd8r8vd65c',
        sub_url: 'https://api.ted.com/v1/talks/<id>/subtitles.json?api-key=uzdyad5pnc2mv2dd8r8vd65c'
    }
};

function detectVendor(url) {
    for (var v in vendors) {
        if (!vendors.hasOwnProperty(v)) continue;

        var vend = vendors[v];
        if (url.match(vend.url_pattern))
            return v;
    }
    return undefined;
}

function detectId(url, v) {
    if (!v) return undefined;

    var vendor = vendors[v];
    if (!vendor.url_pattern) return undefined;

    var matches = url.match(vendor.url_pattern);
    return String(matches[matches.length - 1]);
}

exports.buildDb = function (req, res) {
    var TEDListQuery = 'http://api.ted.com/v1/talks.json?api-key=uzdyad5pnc2mv2dd8r8vd65c&limit=100&externals=false&filter=id:>';
    var retrieveNerd = true;
    var limitQps = retrieveNerd ? 10200 : 2200;
    loadList(0);

    function loadList(index) {
        http.getJSON(TEDListQuery + index, function (err, data) {
            if (err || !data) {
                console.log(err);
                res.send("A problem occurred", 500);
                return;
            }
            var total = data.counts.total, current = data.counts.this;
            if (current != 0) {
                var talksList = data.talks;
                var i = -1;
                talksLoop();

                function talksLoop() {
                    try {
                        console.log("loaded video " + index);

                        i++;
                        if (i == current) {
                            console.log("loaded video until " + index);

                            if (total > current) {
                                setTimeout(function () {
                                    loadList(index);
                                }, limitQps);
                            } else {
                                res.send('Db builded successfully');
                            }

                            return;
                        }

                        var talk = talksList[i].talk;
                        index = String(talk.id);

                        db.getVideoFromVendorId('ted', index, function (err, data) {
                            if (!err && data && (data.entities || !data.timedtext)) { //video already in db
                                talksLoop();
                                return;
                            }
                            var uuid;
                            if (data) uuid = data.uuid;
                            setTimeout(function () {
                                loadVideo(index, uuid);
                                talksLoop();
                            }, limitQps);
                        });
                    } catch (err) {
                        console.log('ERROR at video ' + index);
                        console.log(err);
                        talksLoop();

                    }
                }
            }
        });

    }

    function loadVideo(index, uuid) {
        var video = {
            locator: 'www.ted.com/talks/' + index,
            vendor: 'ted',
            vendor_id: index
        };

        if (uuid) video.uuid = uuid;
        getMetadata(video, function (err, metadata) {
            if (err) {
                console.log(LOG_TAG + 'Metadata retrieved with errors.');
                console.log(LOG_TAG + err);
            }

            if (!metadata) {
                console.log(LOG_TAG + 'Metadata unavailable.');
            }

            var fun = uuid ? db.updateVideo : db.insertVideo;

            fun(video, function (err, doc) {
                if (err || !doc) {
                    console.log(LOG_TAG + 'Error in inserting in db ');
                    console.log(err);
                    return;
                }

                //nerdify
                if (retrieveNerd && doc.timedtext) {
                    nerd.getEntities('timedtext', doc.timedtext, 'textrazor', function (err, data) {
                        if (err || !data) {
                            console.log(LOG_TAG + 'Error in nerd retrieving for ' + doc.locator);
                            console.log(err);
                            return;
                        }
                        db.addEntities(doc.uuid, data);
                    });
                }

            });

        });
    }
};

/*
 * Used to filter entities.
 */
function hasExtractor(ent) {
    if (this == "combined")
        return ent.source == "combined";
    return ent.extractor == this;
}

function containsExtractor(array, ext) {
    var filtered = array.filter(hasExtractor, ext);
    if (ext != "combined") {
        filtered = filtered.filter(function (ent) {
            return ent.source != "combined";
        });
    }
    return filtered.length > 0;
}

exports.runHotspot = function (req, res) {
    var uuid = req.param('uuid');
    db.getHotspotProcess(uuid, function (e, status) {
        if (e) {
            console.log("DB Error: " + e.message);
            res.json({error: {code: 500, message: e.message}});
            return;
        }

        if (!status) {
            runHotspotProcess(uuid, function (err, data) {
                if (err) {
                    console.log("Error: " + err.message);
                    res.json({error: {code: 500, message: err.message}});
                    return;
                }
//                res.json({done: true});

//                res.render('hp_resp.ejs', {hotspot: data});
                res.json({hotspot: data});
            });
        } else res.json({done: true});

    });
};

function runHotspotProcess(uuid, callback) {
    db.getVideoFromUuid(uuid, true, function (err, video) {
        if (err || !video) {
            callback(err, video);
            return;
        }

        var srt = new Buffer(video.timedtext, 'utf-8');
        var queryString = '?videoURL=' + video.locator + '&UUID=' + video.uuid + '&visualAnalysis=false&chapterList=';
        var first = true;
        video.chapters.forEach(function (c) {
            if (first)
                first = false;
            else
                queryString += '%23';
            queryString += c.startNPT + ',' + c.endNPT;
        });
        console.log(queryString);
        var post_options = {
            host: 'linkedtv.eurecom.fr',
            port: '80',
            path: '/tedtalks/api/hotspots/generate' + queryString,
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
                'Content-Length': srt.length
            }
        };

        var d = domain.create();
        d.on('error', function (err) {
            console.warn('' + err);
            callback({'message': 'internal error'});
        });
        d.run(function () {
            // Set up the request
            var data = '';
            var post_req = http.request(post_options, function (res) {
                res.setEncoding('utf8');
                res.on('data', function (chunk) {
                    data += chunk;
                });
                res.on('end', function (err) {
                    if (err) {
                        callback(err);
                        return;
                    }

                    if (data.toLowerCase().indexOf('internal error') != -1) {
                        callback({'message': 'Internal error'});
                        return;
                    }
                    if (data.toLowerCase().indexOf('service temporarily unavailable') != -1) {
                        callback({'message': 'service temporarily unavailable'});
                        return;
                    }

                    var results = JSON.parse(data);
                    if (results && results.hp_list) {
                        var hotspots = results.hp_list;
                        console.log(hotspots)
                        db.addHotspots(uuid, hotspots, function (err) {
                            if (err) {
                                callback(err, hotspots);
                                return;
                            }
                            db.setHotspotProcess(uuid, hStatusValue.DONE, function (err, data) {
                                callback(err, hotspots);
                            });
                        });
                    } else {
                        callback(true, false);
                    }

                });
            });

            // post the data
            post_req.write(srt);
            post_req.end();
        });
    });
}

function checkHotspotResults(uuid, callback) {
    console.log("check Hotspot Results");
    /* Call to services */
//    fake results
    var results = {
        //"UUID":"c1851285-972f-4c30-a7fd-1d6b704bb471",
//        "hp_list"
        "hotspots": [
            {
                "startNPT": 41.375999450683594,
                "endNPT": 72.91999816894531,
                "topic_list": [
                    {
                        "label": "Terrorism",
                        "relevance": 0.9563,
                        "url": "http://en.wikipedia.org/Terrorism",
                        "frequency": 1,
                        "inverseFrequency": 0,
                        "finalScore": 1.9126
                    },
                    {
                        "label": "Federal Bureau of Investigation",
                        "relevance": 1.0,
                        "url": "http://en.wikipedia.org/Federal_Bureau_of_Investigation",
                        "frequency": 0,
                        "inverseFrequency": 0,
                        "finalScore": 1.0
                    },
                    {
                        "label": "Homegrown terrorism",
                        "relevance": 0.660215,
                        "url": "http://en.wikipedia.org/Homegrown_terrorism",
                        "frequency": 0,
                        "inverseFrequency": 0,
                        "finalScore": 0.660215
                    },
                    {
                        "label": "Fear",
                        "relevance": 0.2867,
                        "url": "http://en.wikipedia.org/Fear",
                        "frequency": 1,
                        "inverseFrequency": 0,
                        "finalScore": 0.5734
                    }
                ],
                "entity_list": [
                    {
                        "idEntity": 0,
                        "label": "FBI",
                        "startChar": 542,
                        "endChar": 545,
                        "extractorType": "DBpedia:Agent,Organisation;Freebase:/book/book_subject,/government/government_agency,/business/employer,/projects/project_participant,/fictional_universe/fictional_employer,/dataworld/data_provider,/fictional_universe/fictional_organization,/government/governmental_body,/organization/organization",
                        "nerdType": "http://nerd.eurecom.fr/ontology#Organization",
                        "confidence": 5.38761,
                        "relevance": 0.497684,
                        "startNPT": 44.376,
                        "endNPT": 46.413,
                        "uri": "http://en.wikipedia.org/wiki/Federal_Bureau_of_Investigation",
                        "inverseFrequency": 1,
                        "finalScore": 0.497684
                    },
                    {
                        "idEntity": 0,
                        "label": "FBI",
                        "startChar": 931,
                        "endChar": 934,
                        "extractorType": "DBpedia:Agent,Organisation;Freebase:/book/book_subject,/government/government_agency,/business/employer,/projects/project_participant,/fictional_universe/fictional_employer,/dataworld/data_provider,/fictional_universe/fictional_organization,/government/governmental_body,/organization/organization",
                        "nerdType": "http://nerd.eurecom.fr/ontology#Organization",
                        "confidence": 5.38761,
                        "relevance": 0.497684,
                        "startNPT": 67.429,
                        "endNPT": 69.342,
                        "uri": "http://en.wikipedia.org/wiki/Federal_Bureau_of_Investigation",
                        "inverseFrequency": 1,
                        "finalScore": 0.497684
                    },
                    {
                        "idEntity": 0,
                        "label": "FBI\u0027s",
                        "startChar": 931,
                        "endChar": 936,
                        "extractorType": "DBpedia:Agent,Organisation;Freebase:/book/book_subject,/government/government_agency,/business/employer,/projects/project_participant,/fictional_universe/fictional_employer,/dataworld/data_provider,/fictional_universe/fictional_organization,/government/governmental_body,/organization/organization",
                        "nerdType": "http://nerd.eurecom.fr/ontology#Organization",
                        "confidence": 1.2213,
                        "relevance": 0.497684,
                        "startNPT": 67.429,
                        "endNPT": 69.342,
                        "uri": "http://en.wikipedia.org/wiki/Federal_Bureau_of_Investigation",
                        "inverseFrequency": 0,
                        "finalScore": 0.497684
                    },
                    {
                        "idEntity": 0,
                        "label": "FBI agents",
                        "startChar": 542,
                        "endChar": 552,
                        "extractorType": "DBpedia:Agent,Organisation;Freebase:/book/book_subject,/government/government_agency,/business/employer,/projects/project_participant,/fictional_universe/fictional_employer,/dataworld/data_provider,/fictional_universe/fictional_organization,/government/governmental_body,/organization/organization",
                        "nerdType": "http://nerd.eurecom.fr/ontology#Organization",
                        "confidence": 4.70778,
                        "relevance": 0.452969,
                        "startNPT": 44.376,
                        "endNPT": 46.413,
                        "uri": "http://en.wikipedia.org/wiki/Federal_Bureau_of_Investigation",
                        "inverseFrequency": 1,
                        "finalScore": 0.452969
                    }
                ],
                "visualConcept_list": [  ]
            },
            {
                "startNPT": 146.2760009765625,
                "endNPT": 188.3470001220703,
                "topic_list": [
                    {
                        "label": "Law",
                        "relevance": 0.396366,
                        "url": "http://en.wikipedia.org/Category:Law",
                        "frequency": 3,
                        "inverseFrequency": 0,
                        "finalScore": 1.585464
                    },
                    {
                        "label": "Eco-terrorism",
                        "relevance": 0.712097,
                        "url": "http://en.wikipedia.org/Eco-terrorism",
                        "frequency": 1,
                        "inverseFrequency": 0,
                        "finalScore": 1.424194
                    },
                    {
                        "label": "Criminal law",
                        "relevance": 0.680863,
                        "url": "http://en.wikipedia.org/Category:Criminal_law",
                        "frequency": 0,
                        "inverseFrequency": 0,
                        "finalScore": 0.680863
                    },
                    {
                        "label": "Terrorism",
                        "relevance": 0.300221,
                        "url": "http://en.wikipedia.org/Terrorism",
                        "frequency": 1,
                        "inverseFrequency": 0,
                        "finalScore": 0.600442
                    },
                    {
                        "label": "Violence",
                        "relevance": 0.231538,
                        "url": "http://en.wikipedia.org/Violence",
                        "frequency": 1,
                        "inverseFrequency": 0,
                        "finalScore": 0.463076
                    }
                ],
                "entity_list": [
                    {
                        "idEntity": 0,
                        "label": "terrorists",
                        "startChar": 2340,
                        "endChar": 2350,
                        "extractorType": "Freebase:/film/film_subject,/organization/organization_type,/media_common/quotation_subject,/fictional_universe/fictional_organization_type,/book/book_subject,/education/field_of_study",
                        "nerdType": "http://nerd.eurecom.fr/ontology#Organization",
                        "confidence": 1.74152,
                        "relevance": 0.518995,
                        "startNPT": 161.287,
                        "endNPT": 163.425,
                        "uri": "http://en.wikipedia.org/wiki/Terrorism",
                        "inverseFrequency": 1,
                        "finalScore": 0.518995
                    },
                    {
                        "idEntity": 0,
                        "label": "animal cruelty",
                        "startChar": 2553,
                        "endChar": 2567,
                        "extractorType": "null",
                        "nerdType": "http://nerd.eurecom.fr/ontology#Thing",
                        "confidence": 3.64763,
                        "relevance": 0.340285,
                        "startNPT": 176.487,
                        "endNPT": 179.747,
                        "uri": "http://en.wikipedia.org/wiki/Cruelty_to_animals",
                        "inverseFrequency": 0,
                        "finalScore": 0.340285
                    },
                    {
                        "idEntity": 0,
                        "label": "nonviolent",
                        "startChar": 2315,
                        "endChar": 2325,
                        "extractorType": "Freebase:/film/film_subject,/organization/organization_sector,/media_common/quotation_subject,/book/book_subject",
                        "nerdType": "http://nerd.eurecom.fr/ontology#Organization",
                        "confidence": 3.39831,
                        "relevance": 0.337412,
                        "startNPT": 158.598,
                        "endNPT": 161.287,
                        "uri": "http://en.wikipedia.org/wiki/Nonviolence",
                        "inverseFrequency": 0,
                        "finalScore": 0.337412
                    },
                    {
                        "idEntity": 0,
                        "label": "police",
                        "startChar": 2254,
                        "endChar": 2260,
                        "extractorType": "Freebase:/film/film_subject,/organization/organization_sector,/tv/tv_genre,/book/book_subject,/film/film_genre,/media_common/media_genre,/interests/collection_category,/organization/organization_type,/media_common/quotation_subject,/fictional_universe/fictional_organization_type",
                        "nerdType": "http://nerd.eurecom.fr/ontology#Organization",
                        "confidence": 1.13486,
                        "relevance": 0.313671,
                        "startNPT": 155.273,
                        "endNPT": 158.598,
                        "uri": "http://en.wikipedia.org/wiki/Police",
                        "inverseFrequency": 1,
                        "finalScore": 0.313671
                    },
                    {
                        "idEntity": 0,
                        "label": "eco-terrorism",
                        "startChar": 2384,
                        "endChar": 2397,
                        "extractorType": "null",
                        "nerdType": "http://nerd.eurecom.fr/ontology#Thing",
                        "confidence": 6.85926,
                        "relevance": 0.830181,
                        "startNPT": 163.425,
                        "endNPT": 167.048,
                        "uri": "http://en.wikipedia.org/wiki/Eco-terrorism",
                        "inverseFrequency": 3,
                        "finalScore": 0.276727
                    }
                ],
                "visualConcept_list": [

                ]
            },
            {
                "startNPT": 188.2899932861328,
                "endNPT": 217.6300048828125,
                "topic_list": [
                    {
                        "label": "Ag-gag",
                        "relevance": 0.508107,
                        "url": "http://en.wikipedia.org/Ag-gag",
                        "frequency": 1,
                        "inverseFrequency": 0,
                        "finalScore": 1.016214
                    },
                    {
                        "label": "Prosecutor",
                        "relevance": 0.30489,
                        "url": "http://en.wikipedia.org/Prosecutor",
                        "frequency": 1,
                        "inverseFrequency": 0,
                        "finalScore": 0.60978
                    },
                    {
                        "label": "Slaughterhouse",
                        "relevance": 0.198223,
                        "url": "http://en.wikipedia.org/Slaughterhouse",
                        "frequency": 1,
                        "inverseFrequency": 0,
                        "finalScore": 0.396446
                    }
                ],
                "entity_list": [
                    {
                        "idEntity": 0,
                        "label": "ag-gag",
                        "startChar": 2741,
                        "endChar": 2747,
                        "extractorType": "null",
                        "nerdType": "http://nerd.eurecom.fr/ontology#Thing",
                        "confidence": 4.38494,
                        "relevance": 0.826092,
                        "startNPT": 188.347,
                        "endNPT": 190.685,
                        "uri": "http://en.wikipedia.org/wiki/Ag-gag",
                        "inverseFrequency": 0,
                        "finalScore": 0.826092
                    },
                    {
                        "idEntity": 0,
                        "label": "Amy Meyer",
                        "startChar": 2805,
                        "endChar": 2814,
                        "extractorType": "DBpedia:Person;Freebase:/people/person",
                        "nerdType": "http://nerd.eurecom.fr/ontology#Person",
                        "confidence": 0.5,
                        "relevance": 0.5,
                        "startNPT": 192.12,
                        "endNPT": 193.772,
                        "uri": "",
                        "inverseFrequency": 0,
                        "finalScore": 0.5
                    },
                    {
                        "idEntity": 0,
                        "label": "Amy",
                        "startChar": 2820,
                        "endChar": 2823,
                        "extractorType": "DBpedia:Person;Freebase:/people/person",
                        "nerdType": "http://nerd.eurecom.fr/ontology#Person",
                        "confidence": 0.5,
                        "relevance": 0.5,
                        "startNPT": 193.772,
                        "endNPT": 195.385,
                        "uri": "",
                        "inverseFrequency": 0,
                        "finalScore": 0.5
                    }
                ],
                "visualConcept_list": [

                ]
            }
        ]
    };

    if (results) {
        db.addHotspots(uuid, results.hotspots, function (err) {
            if (err) {
                callback(err);
                return;
            }
            db.setHotspotProcess(uuid, hStatusValue.DONE, function (err, data) {
                callback(err, results.hotspots);
            });
        });
    } else {
        callback(true, false);
    }
}


module.exports.rdfTalks = function (req, res) {
    courseSuggestion.getAllTalks(function (err, data) {
        if (err) {
            console.error(err);
            res.render('error', errorMsg.e500);
            return;
        }

        db.
        res.json(data);
    })
};