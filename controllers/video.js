var http = require('http'),
    https = require('https'),
    url = require("url"),
    async = require('async'),
    nerd = require('./nerdify'),
    db = require('./database'),
    ts = require('./linkedTVconnection'),
    errorMsg = require('./error_msg'),
    utils = require('./utils');

var LOG_TAG = '[VIDEO.JS]: ';
var hStatusValue = {
    'IN_PROGRESS': 1,
    'DONE': 2
};

var time1d = 86400000; //one day
ts.prepare();

var mergeObj = utils.mergeObj;

/*
 * Prepare and render a video already in db
 */
function viewVideo(req, res, video) {
    var enriched = req.query.enriched;
    var videoURI = video.videoLocator || video.locator;

    // Identify the media fragment part
    var concSign = url.parse(videoURI).hash ? '&' : '#';
    var t = req.query.t;
    if (t) {
        videoURI += concSign + 't=' + t;
        concSign = '&';
    }
    var xywh = req.query.xywh;
    if (xywh) {
        videoURI += concSign + 'xywh=' + xywh;
    }

    var options = {
        videoURI: videoURI,
        enriched: enriched
    };

    // Prepare nerd entity part
    if (!enriched || !video.metadata.timedtext) {
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
    var source = mergeObj(video, options);
    res.render('video.ejs', source);
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

        if (!video.timestamp || Date.now() - video.timestamp > time1d) {
            //UPDATE METADATA
            console.log("updating metadata for video " + uuid);
            // 1. search for metadata in sparql
            getMetadataFromSparql(video, function (err, data) {
                if (err || !data) {
                    console.log("No data obtained from sparql");
                } else {
                    video = mergeObj(video, data);
                }

                //2. search metadata with vendor's api
                getMetadata(video, function (err, metadata) {
                    //TODO menage chapters
                    if (err) {
                        console.log(LOG_TAG + 'Metadata retrieved with errors.');
                    }
                    if (!metadata) {
                        console.log(LOG_TAG + 'Metadata unavailable.');
                    } else {
                        var oldmetadata = video.metadata || {};
                        video.metadata = mergeObj(oldmetadata, metadata);
                    }

                    //3. write in db
                    video.timestamp = Date.now();
                    db.updateVideoUuid(uuid, video, function (err) {
                        if (err) {
                            console.log("DATABASE ERROR");
                            console.log(err);
                            console.log("Can not updateVideoUuid");
                        }
                    });

                });
            });
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

            // 1. search for metadata in sparql
            getMetadataFromSparql(video, function (err, data) {

                if (err || !data) {
                    console.log("No data obtained from sparql");
                } else {
                    video = mergeObj(video, data);
                }

                //2. search metadata with vendor's api
                getMetadata(video, function (err, metadata) {
                    if (err) {
                        console.log(LOG_TAG + 'Metadata retrieved with errors.');
                    }
                    if (!metadata) {
                        console.log(LOG_TAG + 'Metadata unavailable.');
                    } else {
                        var oldmetadata = video.metadata || {};
                        video.metadata = mergeObj(oldmetadata, metadata);
                    }
                    var chapters;
                    if (metadata.chapters) {
                        chapters = metadata.chapters;
                        delete metadata.chapters;
                    }

                    //3. write in db
                    db.insertVideo(video, function (err, data) {
                        if (err) {
                            console.log("DATABASE ERROR" + JSON.stringify(err));
                            resp.render('error.ejs', errorMsg.e500);
                            return;
                        }
                        var redirectUrl = '/video/' + data.uuid + fragPart + hashPart;

                        if (chapters) {
                            db.addChapters(data.uuid, chapters, function (err, data) {
                                if (err) {
                                    console.log("DATABASE ERROR" + JSON.stringify(err));
                                }
                                console.log('Video at ' + locator + ' successfully added to db.');
                                console.log('Redirecting to ' + redirectUrl);
                                resp.redirect(redirectUrl);
                            });

                        } else {
                            console.log('Video at ' + locator + ' successfully added to db.');
                            console.log('Redirecting to ' + redirectUrl);
                            resp.redirect(redirectUrl);
                        }
                    });
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

function getEntities(video, ext, callback) {
    console.log('nerdifing video ' + video.uuid + ' with ' + ext);
    var doc_type, text;
    if (video.metadata.timedtext) {
        doc_type = 'timedtext';
        text = video.metadata.timedtext;
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
            sparql_data.metadata = {
                timedtext: data
            };
            callback(err, sparql_data);
        });
    });
}

function getMetadata(video, callback) {
    if (!video.vendor || !video.vendor_id) {
        callback(true);
        return;
    }
    var metadata = {};
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
                            metadata.timedtext = data;
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
                        metadata.published = data.created_time;
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
                                    metadata.timedtext = data;
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
                video.videoLocator = datatalk.media.internal ? datatalk.media.internal['950k'].uri : datatalk.media.external.uri;
                video.vendor_id = String(datatalk.id);
                metadata.title = datatalk.name;
                metadata.thumb = datatalk.images[1].image.url;
                metadata.descr = datatalk.description.replace(new RegExp('<br />', 'g'), '\n');
                metadata.views = datatalk.viewed_count;
                metadata.comments = datatalk.commented_count;
                metadata.published = datatalk.published_at;
                metadata.event = datatalk.event.name;
                metadata.poster = datatalk.images[2].image.url;

                var subUrl = vendors['ted'].sub_url.replace('<id>', video.vendor_id);

//                console.log("retrieving subs from " + subUrl);
                http.getJSON(subUrl, function (err, data) {
                    if (!err && data) {
                        metadata.timedtext = jsonToSrt(data);
                        //obtain chapters from json
                        metadata.chapters = getTedChapters(data);

                    } else {
                        console.log('[ERROR ' + err + '] on retrieving sub for ' + video.locator);
                    }
                    callback(false, metadata);
                });
            });
            break;
        default :
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
            getMetadata(data, function (err, data) {
                res.json(data);
            });
        }
    });

};

function getSubtitlesTV2RDF(uuid, callback) {
    http.getRemoteFile('http://linkedtv.eurecom.fr/tv2rdf/api/mediaresource/' + uuid + '/metadata?metadataType=subtitle', callback);
}

function getTedChapters(json) {
    var cur_chap = {startNPT: 0}, cursub;
    var chapters = [];

    var sub_offset = json._meta.preroll_offset;
    for (var key in json) {

        if (json.hasOwnProperty(key) && key != '_meta') {
            cursub = json[key].caption;
            var isStartOfChap = cursub.startOfParagraph;

            if (isStartOfChap) {
                var sub_startTime = cursub.startTime;
                var thisChapStart = (sub_offset + sub_startTime) / 1000;

                cur_chap.endNPT = thisChapStart;
                chapters.push(cur_chap);
                cur_chap = {"startNPT": thisChapStart};
            }
        }
    }
    var lastsub_startTime = cursub.startTime;
    var lastChapStart = (sub_offset + lastsub_startTime) / 1000;
    var lastChapEnd = lastChapStart + (cursub.duration / 1000) + 6;
    chapters.push({"startNPT": thisChapStart, "endNPT": lastChapEnd});
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

function subTime(time) {
    var fTime;
    if (time < 60) {
        fTime = (time > 9) ? "00:00:" + time.toFixed(3) : "00:00:0" + time.toFixed(3);
    }
    else if (time == 60 || time > 60 && time < 3600) {
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

http.getJSON = function (url, callback) {
    http.getRemoteFile(url, function (err, body) {
        if (err) {
            callback(err, body);
            return;
        }
        body = body.substring(body.indexOf('{'), body.lastIndexOf('}') + 1);
        body = JSON.parse(body);
        callback(false, body);
    });
};

http.getRemoteFile = function (url, callback) {
    var protocol = http;
    if (url.startsWith('https'))
        protocol = https;

    protocol.get(url, function (res) {
        if (res.statusCode != 200) {
            callback(res.statusCode, res.statusCode);
            return;
        }

        var body = '';
        res.on('data', function (chunk) {
            body += chunk;
        });
        res.on('end', function () {
            if (body == '') {
                callback(true, 'Empty Response');
                return;
            }
            callback(false, body);
        });
    });
};

if (typeof String.prototype.startsWith != 'function') {
    // see below for better implementation!
    String.prototype.startsWith = function (str) {
        return this.indexOf(str) == 0;
    };
}

exports.buildDb = function (req, res) {
    var TEDListQuery = 'http://api.ted.com/v1/talks.json?api-key=uzdyad5pnc2mv2dd8r8vd65c&limit=100&filter=id:>';
    var limitQps = 10200;
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
                            if (!err && data && (data.entities || !data.metadata.timedtext)) { //video already in db
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

        getMetadata(video, function (err, metadata) {
            //TODO menage chapters
            if (err) {
                console.log(LOG_TAG + 'Metadata retrieved with errors.');
                console.log(LOG_TAG + err);
            }
            if (!metadata) {
                console.log(LOG_TAG + 'Metadata unavailable.');
            } else {
                video.metadata = metadata;
            }

            var fun = uuid ? db.updateVideo : db.insertVideo;

            fun(video, function (err, doc) {
                //nerdify
                if (doc.metadata.timedtext) {
                    nerd.getEntities('timedtext', doc.metadata.timedtext, 'textrazor', function (err, data) {
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
                res.json({done: true});
            });
        } else res.json({done: true});

    });
};

function runHotspotProcess(uuid, callback) {
    /* Call to service */
    db.setHotspotProcess(uuid, hStatusValue.IN_PROGRESS, callback);
}

function checkHotspotResults(uuid, callback) {
    console.log("check Hotspot Results");
    /* Call to services */
    //fake results
    var results = {
        hotspots: [
            {
                startNPT: 20,
                endNPT: 36,
                mainEnt: [
                    {
                        label: 'one',
                        type: 'thing'
                    },
                    {
                        label: 'two',
                        type: 'thing'
                    },
                    {
                        label: 'three',
                        type: 'thing'
                    }
                ]
            },
            {
                startNPT: 120,
                endNPT: 236,
                mainEnt: [
                    {
                        label: 'one',
                        type: 'thing'
                    },
                    {
                        label: 'two',
                        type: 'thing'
                    },
                    {
                        label: 'three',
                        type: 'thing'
                    }
                ]
            },
            {
                startNPT: 300,
                endNPT: 390,
                mainEnt: [
                    {
                        label: 'one',
                        type: 'thing'
                    },
                    {
                        label: 'two',
                        type: 'thing'
                    },
                    {
                        label: 'three',
                        type: 'thing'
                    }
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