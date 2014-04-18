var http = require('http'),
    https = require('https'),
    url = require("url"),
    async = require('async');

var LOG_TAG = '[VIDEO.JS]: ';


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

    var info = null
    var vendor = detectVendor(videoURI);
    if (vendor) {
        var id = detectId(videoURI, vendor);
        if (id) {
            info = getMetadata(id, vendor);
        }
    }

    var source = {
        videoURI: videoURI,
        videoInfo: info
    };
    res.render('video.ejs', source);
}

function getMetadata(video_id, vendor) {
    var video_info = {
        video_id: video_id,
        vendor: vendor.name
    };

    switch (vendor.name) {
        case 'youtube':
            async.parallel([
                function (callback) {
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
                            console.log('1');
                            callback(false);
                        } else {
                            //TODO
                            callback(true);
                        }
                    });
                },
                function (callback) {
                    getYouTubeSub(video_info.video_id, function (err, data) {
                        if (err) {
                            console.log(err);
                            video_info.sub = false;
                            callback(true);
                        } else {
                            console.log('2');
                            video_info.sub = data;
                            callback(false);
                        }
                    });
                }
            ], function (err) {
                console.log('Both ended with err: ' + err);
                return video_info;
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
                console.log('Both ended with err: ' + err);
                return video_info;
            });
            break;
        default :
            return 'Vendor undefined or not recognized'
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
        name: 'youtube',
        url_pattern: /^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?=.*v=((\w|-){11}))(?:\S+)?$/,
        id_pattern: /v=(.{11})/
    },
    {
        name: 'dailymotion',
        url_pattern: /^.+dailymotion.com\/(video|hub)\/([^_]+)[^#]*(#video=([^_&]+))?/,
        id_pattern: /video\/([^_||^#]+)/
    },
    {
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
