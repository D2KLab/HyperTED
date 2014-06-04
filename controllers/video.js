var http = require('http'),
    https = require('https'),
    url = require("url"),
    async = require('async'),
    nerd = require('./nerdify'),
    db = require('./database'),
    ts = require('./linkedTVconnection'),
    errorMsg = require('./error_msg');

var LOG_TAG = '[VIDEO.JS]: ';
var time1d = 86400000; //one day
ts.prepare();


function viewVideo(req, res, videoInfo) {
    var videoURI = videoInfo.videoLocator || videoInfo.locator;

    var enriched = req.query.enriched;
    videoInfo.enriched = enriched;

    var concSign = url.parse(videoURI).hash ? '&' : '#';
    var t = req.query.t;
    if (t) {
        videoURI += concSign + 't=' + t;
        concSign = '&';
    }
    var xywh = req.query.xywh;
    if (xywh) {
        videoURI += concSign + 'xywh=' + xywh;
//        concSign = '&';
    }

    videoInfo.videoURI = videoURI;

    var areEntitiesUpdated = videoInfo.entities && !videoInfo.entitiesFromLTV && videoInfo.entTimestap
        && videoInfo.timestamp && videoInfo.entTimestap >= videoInfo.timestamp;

    if (!enriched || (videoInfo.entities && areEntitiesUpdated) || (!videoInfo.vendor)) {
        res.render('video.ejs', videoInfo);
    } else {
        getEntities(videoInfo, function (err, data) {
            if (err) {
                console.log(LOG_TAG + 'error in getEntity: ' + err.message);
                videoInfo.error = "Sorry. We are not able to retrieving NERD entities now.";
            } else {
                videoInfo.entities = data;
            }
            res.render('video.ejs', videoInfo);
        });
    }
}

exports.view = function (req, res) {
    var uuid = req.param('uuid');
    if (!uuid) {
        res.render('error.ejs', errorMsg.e400);
        return;
    }
    db.getFromUuid(uuid, function (err, video) {
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
                    db.update(uuid, video, function (err) {
                        if (err) {
                            console.log("DATABASE ERROR" + JSON.stringify(err));
                            console.log("Can not update");
                        }
                    });

                });
            });
        }
        viewVideo(req, res, video);
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

    db.getFromLocator(locator, function (err, data) {
        if (err) { //db error
            console.log("DATABASE ERROR" + JSON.stringify(err));
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
        db.getFromVendorId(vendor, id, function (err, data) {
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

                    //3. write in db
                    db.insert(video, function (err, data) {
                        if (err) {
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


    });
};

exports.nerdify = function (req, res) {
    var uuid = req.query.uuid;

    db.getFromUuid(uuid, function (err, video_data) {
        if (!video_data) {
            console.log("Error from DB");
            res.json({error: "Error from DB"});
            return;
        }

        if (video_data.entities) {
            video_data.enriched = true;
            res.render('nerdify_resp.ejs', video_data);
        } else {
            console.log(LOG_TAG + 'nerdifying ' + uuid);
            getEntities(video_data, function (err, data) {
                if (err) {
                    console.log(LOG_TAG + err.message);
                    res.json({error: "Error from NERD"});
                    return;
                }

                video_data.entities = data;
                video_data.enriched = true;
                res.render('nerdify_resp.ejs', video_data);
            });
        }
    });
};

function getEntities(video_info, callback) {
    var doc_type, text;
    if (video_info.metadata.timedtext) {
        doc_type = 'timedtext';
        text = video_info.metadata.timedtext;
    } else {
        doc_type = 'text';
        text = video_info.metadata.descr;
    }
    nerd.getEntities(doc_type, text, function (err, data) {
        if (!err && data) {
            db.addEntities(video_info.uuid, data, function () {
            });
        }
        callback(err, data);
    });
}

function getMetadataFromSparql(video, callback) {
    ts.getFromLocator(video.locator, function (err, data) {
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
    var vendor = video.vendor || detectVendor(video.locator);
    if (!vendor) {
        callback(true);
        return;
    }
    video.vendor = vendor;
    var id = video.vendor_id || detectId(video.locator, vendor);
    if (!id) {
        callback(true);
        return;
    }
    video.vendor_id = id;

    var metadata = {};

    switch (vendor.name) {
        case 'youtube':
            async.parallel([
                function (async_callback) {
                    var json_url = 'http://gdata.youtube.com/feeds/api/videos/' + id + '?v=2&alt=json-in-script';
                    http.getJSON(json_url, function (err, data) {
                        if (err) {
                            console.log('[ERROR] on retrieving metadata from ' + json_url);
                            async_callback(true);
                        } else {
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
                        }
                    });
                },
                function (async_callback) {
                    getYouTubeSub(id, function (err, data) {
                        if (err) {
                            console.log('[ERROR] on retrieving sub for ' + video.locator);
                            async_callback(true);
                        } else {
                            metadata.timedtext = data;
                            async_callback(false);
                        }
                    });
                }
            ], function (err) {
                callback(err, metadata);
            });
            break;
        case 'dailymotion':
            async.parallel([
                function (async_callback) {
                    var json_url = 'https://api.dailymotion.com/video/' + id + '?fields=title,thumbnail_60_url,description,views_total,bookmarks_total,comments_total,ratings_total,rating,created_time,genre';
                    http.getJSON(json_url, function (err, data) {
                        if (err) {
                            console.log('[ERROR] on retrieving metadata from ' + json_url);
                            async_callback(true);
                        } else {
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
                        }
                    })
                },
                function (async_callback) {
                    getDailymotionSub(id, function (err, data) {
                        if (err) {
                            console.log('[ERROR] on retrieving sub for ' + video.locator);
                            async_callback(false);
                        } else {
                            metadata.timedtext = data;
                            async_callback(false);
                        }
                    });
                }
            ], function (err) {
                callback(err, metadata);
            });
            break;
        case 'vimeo':
            async.parallel([
                function (async_callback) {
                    var json_url = 'http://vimeo.com/api/v2/video/' + id + '.json';
                    console.log('retrieving metadata from ' + json_url);
                    http.getJSON(json_url, function (err, data) {
                        if (err) {
                            console.log('[ERROR] on retrieving metadata from ' + json_url);
                            async_callback(true);
                        } else {
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
                            async_callback(false);
                        }
                    });
                },
                function (async_callback) {
                    getVimeoSub(id, function (err, data) {
                        if (err) {
                            console.log('[ERROR] on retrieving sub for ' + video.locator);
                            async_callback(false);
                        } else {
                            metadata.timedtext = data;
                            async_callback(false);
                        }
                    });
                }
            ], function (err) {
                callback(err, metadata);
            });
            break;
        case 'ted':
            var json_url = 'https://api.ted.com/v1/talks/' + id + '.json?api-key=uzdyad5pnc2mv2dd8r8vd65c';
            console.log('retrieving metadata from ' + json_url);
            http.getJSON(json_url, function (err, data) {
                if (err) {
                    console.log('[ERROR] on retrieving metadata from ' + json_url);
                    callback(true);
                } else {
                    video.videoLocator = data.talk.media.internal['950k'].uri;
                    video.tedID = data.talk.id;
                    metadata.title = data.talk.name;
                    metadata.thumb = data.talk.images[1].image.url;
                    metadata.descr = data.talk.description.replace(new RegExp('<br />', 'g'), '\n');
                    metadata.views = data.talk.viewed_count;
                    metadata.comments = data.talk.commented_count;
                    metadata.published = data.talk.published_at;
                    metadata.event = data.talk.event.name;
                    metadata.poster = data.talk.images[2].image.url;

                    getTedSub(video.tedID, function (err, data) {
                        if (err) {
                            console.log('[ERROR] on retrieving sub for ' + video.locator);
                        } else {
                            metadata.timedtext = data;
                        }
                        callback(err, metadata);
                    });
                }
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

    db.getFromUuid(uuid, function (err, data) {
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

function getVimeoSub(video_id, callback) {
//    var subUrl = "http://www.youtube.com/api/timedtext?lang=en&format=srt&v=" + video_id;
//    //TODO chiederli anche in altre lingue
//    http.getRemoteFile(subUrl, callback);

    callback(true, null);
}

function getDailymotionSub(video_id, callback) {
    var subListUrl = 'https://api.dailymotion.com/video/' + video_id + '/subtitles?fields=id,language%2Curl';
    console.log('retrieving sub list from ' + subListUrl);
    http.getJSON(subListUrl, function (err, data) {
        if (!err) {
            if (data.total > 0) {
                var subUrl = (data.list[0].url);
                http.getRemoteFile(subUrl, callback);
            } else {
                console.log('no sub available');
                callback(false, null);
            }
        } else {
            callback(err, err.message);
        }
    });
}

function getSubtitlesTV2RDF(uuid, callback) {
    http.getRemoteFile('http://linkedtv.eurecom.fr/tv2rdf/api/mediaresource/' + uuid + '/metadata?metadataType=subtitle', callback);
}

function getYouTubeSub(video_id, callback) {
    var subUrl = "http://www.youtube.com/api/timedtext?lang=en&format=srt&v=" + video_id;
    //TODO chiederli anche in altre lingue
    http.getRemoteFile(subUrl, callback);
}

function getTedSub(video_id, callback) {
    var subListUrl = 'https://api.ted.com/v1/talks/' + video_id + '/subtitles.json?api-key=uzdyad5pnc2mv2dd8r8vd65c';

    jsonToSrt(subListUrl, callback);

}


function jsonToSrt(jsonUrl, callback) {
    http.getJSON(jsonUrl, function (err, data) {
        console.log("retrieving subs from " + jsonUrl);
        if (err) {
            console.log("SUB ERROR");
            callback(err, err.message);
        } else {
            var mysrt = '';
            var sub_offset = data._meta.preroll_offset;

            for (key in data) {
                if (key != '_meta') {
                    var sub_startTime = data[key].caption.startTime;
                    var sub_duration = data[key].caption.duration;
                    var sub_content = data[key].caption.content;

                    var newStart = (sub_offset + sub_startTime) / 1000;
                    var end = newStart + (sub_duration / 1000);

                    mysrt += ++key + '\n' + subTime(newStart) + ' --> ' + subTime(end) + '\n' + sub_content + '\n\n';
                }
            }
            var myUTFsrt = encodeUTF(mysrt);
            callback(false, myUTFsrt);

        }
    });
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


var vendors = [
    {
        code: 1,
        name: 'youtube',
        url_pattern: /^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?=.*v=((\w|-){11}))(?:\S+)?$/,
        id_pattern: /v=(.{11})/
    },
    {
        code: 2,
        name: 'dailymotion',
        url_pattern: /^.+dailymotion.com\/(video|hub)\/([^_]+)[^#]*(#video=([^_&]+))?/,
        id_pattern: /video\/([^_||^#]+)/
    },
    {
        code: 3,
        name: 'vimeo',
        url_pattern: /(www.)?(player.)?vimeo.com\/([a-z]*\/)*([0-9]{6,11})[?]?.*/,
        id_pattern: /\/([0-9]{6,11})$/
    },
    {
        code: 4,
        name: 'ted',
        url_pattern: /^https?:\/\/(?:www\.)?ted\.com\/talks\/*([^?]+)/,
        id_pattern: /talks\/([^?]+)/
    }
];

function detectVendor(url) {
    var v;
    for (v in vendors) {
        var vend = vendors[v];
        if (url.match(vend.url_pattern))
            return vend;
    }
    return undefined;
}

function detectId(url, vendor) {
    if (vendor && vendor.id_pattern)
        return url.match(vendor.id_pattern)[1];
    return undefined;
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
            callback(true, res.statusCode);
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


function mergeObj() {
    var mObj = {};
    for (var o in arguments) {
        var obj = arguments[o];
        for (var attrname in obj) {
            mObj[attrname] = obj[attrname];
        }
    }
    return mObj;
}
