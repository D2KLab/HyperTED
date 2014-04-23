var http = require('http'),
    https = require('https'),
    url = require("url"),
    async = require('async'),
    Cache = require("node-cache"),
    nerd = require('./nerdify');

var LOG_TAG = '[VIDEO.JS]: ';
var videoCache;


//exports.getSub = function (vendor, video_id, callback) {
exports.getSub = function (req, res) {
    var video_id = req.query.video_id;
    var vendor = req.query.vendor;
    if (video_id == null || video_id == '') {
        console.error(LOG_TAG + "Empty video id");
        res.send(400, "Empty video id");
        return;
    }

    var subFunction;

    switch (vendor) {
        case 'youtube':
            subFunction = getYouTubeSub;
            break;
        case 'dailymotion':
            subFunction = getDailymotionSub;
            break;
        default :
            console.log(LOG_TAG + 'Vendor not recognized or not supported.');
            res.send(400, "Vendor not recognized or not supported.");
            return;
    }

    subFunction(video_id, function (err, msg) {
        if (err) {
            res.send(404, msg);
        } else {
            res.send(200, msg);
        }
    });
};

exports.view = function (req, res) {
    var videoURI = req.query.uri;
    var enriched = req.query.enriched;
    if (!videoURI) {
        res.redirect('/');
        return;
    }
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

    function sendResp(infoObj) {
        var source = {
            videoURI: videoURI,
            videoInfo: infoObj,
            enriched: enriched
        };
        res.render('video.ejs', source);
    }

    var vendor = detectVendor(videoURI);
    if (vendor) {
        var id = detectId(videoURI, vendor);
        if (id) {
            var cacheKey = vendor.code + '-' + id;
            var info = getFromCache(cacheKey);
            if (info) {
                if (!enriched || info.entities) {
                    sendResp(info);
                } else {
                    getEntities(info, function (err, data) {
                        if (err) {
                            console.log(LOG_TAG + data);
                            // TODO
                        } else {
                            info.entities = data;
                        }

                        sendResp(info);
                        videoCache.set(cacheKey, info);
                    });
                }
            } else {
                info = getMetadata(id, vendor, function (err, response) {
                    info = response || info;
                    if (enriched) {
                        getEntities(info, function (err, data) {
                            if (err) {
                                console.log(LOG_TAG + data);
                                // TODO
                            } else {
                                info.entities = data;
                            }
                            sendResp(info);
                            videoCache.set(cacheKey, info);
                        });
                    } else {
                        sendResp(info);
                        videoCache.set(cacheKey, info);
                    }
                });
            }

        }
    }
};

exports.nerdify = function (req, res) {
    var id = req.query.videoid;
    var vendor = req.query.vendor;
    var cacheKey = vendor + '-' + id;
    var info = getFromCache(cacheKey);

    if (!info.entities) {
        console.log(LOG_TAG + 'nerdifying ' + cacheKey);
        getEntities(info, function (err, data) {
            if (err) {
                console.log(LOG_TAG + data);
                // TODO
            } else {
                info.entities = data;
            }
            var source = {
                videoInfo: info,
                enriched: true
            };
            res.render('nerdify_resp.ejs', source);
            videoCache.set(cacheKey, info);
        });
    } else {
        var source = {
            videoInfo: info,
            enriched: true
        };
        res.render('nerdify_resp.ejs', source);

    }
};

function getEntities(video_info, callback) {
    var doc_type, text;
    if (video_info.sub) {
        doc_type = 'timedtext';
        text = video_info.sub;
    } else {
        doc_type = 'text';
        text = video_info.descr;
    }
    nerd.getEntities(doc_type, text, callback);
}

function getMetadata(video_id, vendor, callback) {
    var video_info = {
        video_id: video_id,
        vendor: vendor.code
    };

    switch (vendor.name) {
        case 'youtube':
            async.parallel([
                function (async_callback) {
                    var json_url = 'http://gdata.youtube.com/feeds/api/videos/' + video_info.video_id + '?v=2&alt=json-in-script';
                    console.log('retrieving metadata from ' + json_url);
                    http.getJSON(json_url, function (err, data) {
                        if (!err) {
                            video_info.title = data.entry.title.$t;
                            video_info.thumb = data.entry.media$group.media$thumbnail[0].url;
                            video_info.descr = data.entry.media$group.media$description.$t.replace(new RegExp('<br />', 'g'), '\n');
                            video_info.views = data.entry.yt$statistics.viewCount;
                            video_info.favourites = data.entry.yt$statistics.favoriteCount;
                            video_info.comments = data.entry.gd$comments.gd$feedLink.countHint;
                            video_info.likes = data.entry.yt$rating.numLikes;
                            video_info.avgRate = data.entry.gd$rating.average;
                            video_info.published = data.entry.published.$t;
                            video_info.category = data.entry.category[1].term;
                            async_callback(false);
                        } else {
                            //TODO
                            async_callback(true);
                        }
                    });
                },
                function (async_callback) {
                    getYouTubeSub(video_info.video_id, function (err, data) {
                        if (err) {
                            console.log(err);
                            video_info.sub = false;
                            async_callback(true);
                        } else {
                            video_info.sub = data;
                            async_callback(false);
                        }
                    });
                }
            ], function (err) {
                callback(err, video_info);
            });
            break;
        case 'dailymotion':
            async.parallel([
                function () {
                    var json_url = 'https://api.dailymotion.com/video/' + video_info.video_id + '?fields=title,thumbnail_60_url,description,views_total,bookmarks_total,comments_total,ratings_total,rating,created_time,genre';
                    console.log('retrieving metadata from ' + json_url);
                    http.getJSON(json_url, function (err, data) {
                        if (!err) {
                            video_info.title = data.title;
                            video_info.thumb = data.thumbnail_60_url;
                            video_info.descr = data.description.replace(new RegExp('<br />', 'g'), '\n');
                            video_info.views = data.views_total;
                            video_info.favourites = data.bookmarks_total;
                            video_info.comments = data.comments_total;
                            video_info.likes = data.ratings_total;
                            video_info.avgRate = data.rating;
                            video_info.published = data.created_time;
                            video_info.category = data.genre;
                        } else {//TODO
                        }
                    })
                },
                function () {
                    getDailymotionSub(video_info.video_id, function (err, data) {
                        if (err) {
                            console.log(err);
                            video_info.sub = false;
                        } else {
                            video_info.sub = data;
                        }
                    });
                }
            ], function (err) {
                callback(err, video_info);
            });
            break;
        default :
            callback(true, 'Vendor undefined or not recognized');
    }

}

function getYouTubeSub(video_id, callback) {
    var subUrl = "http://www.youtube.com/api/timedtext?lang=en&format=srt&v=" + video_id;
    //TODO chiederli anche in altre lingue
    http.getRemoteFile(subUrl, callback);
}

function getDailymotionSub(video_id, callback) {
    var subListUrl = 'https://api.dailymotion.com/video/' + video_id + '/subtitles?fields=id,language%2Curl';
    http.getJSON(subListUrl, function (err, data) {
        if (!err) {
            if (data.total > 0) {
                var subUrl = (data.list[0].url);
                http.getRemoteFile(subUrl, callback);
            }
        }
    });
}

function empty(data) {
    if (typeof(data) == 'number' || typeof(data) == 'boolean') {
        return false;
    }
    if (typeof(data) == 'undefined' || data === null) {
        return true;
    }
    if (typeof(data.length) != 'undefined') {
        return data.length == 0;
    }
    var count = 0;
    for (var i in data) {
        if (data.hasOwnProperty(i)) {
            count++;
        }
    }
    return count == 0;
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
        url_pattern: /^.+vimeo.com\/(\d+)?/
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
    if (vendor.id_pattern)
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

function getFromCache(key) {
    if (!videoCache) {
        videoCache = new Cache();
        return false;
    } else {
        var cachedData = videoCache.get(key);
        return cachedData[key];
    }
}

