var http = require('http'),
    https = require('https'),
    url = require("url"),
    async = require('async'),
    Cache = require("node-cache"),
    nerd = require('./nerdify'),
    db = require('./database'),
    ts = require('./linkedTVconnection');

var LOG_TAG = '[VIDEO.JS]: ';
var videoCache;
ts.prepare();


function viewVideo(req, res, videoURI, uuid, sparql) {
    function sendResp(infoObj) {

        var uri;
        if (infoObj.vendor == 4) {
            http.getJSON('https://api.ted.com/v1/talks/' + infoObj.video_id + '.json?api-key=uzdyad5pnc2mv2dd8r8vd65c', function (err, data) {
                if (err) {
                    //TODO
                } else {
                    uri = data.talk.media.internal['320k'].uri;

                    var source = {
                        videoURI: uri,
                        uuid: uuid,
                        videoInfo: infoObj,
                        enriched: enriched
                    };

                    res.render('video.ejs', source);
                }
            });
            return;
        } else {

            var source = {
                videoURI: videoURI,
                uuid: uuid,
                videoInfo: infoObj,
                enriched: enriched
            };

            res.render('video.ejs', source);
        }
    }

    var enriched = req.query.enriched;

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

    if (sparql) {
        var videoInfo = {};
        async.parallel(
            [
                function (asyncCallback) {
                    getSubtitlesTV2RDF(uuid, function (err, data) {
                        if (data) {
                            videoInfo.timedtext = data;
                        }
                        asyncCallback(err);
                    });
                },
                function (asyncCallback) {
                    ts.getChapters(uuid, function (err, data) {
                        if (data) {
                            videoInfo.chapters = data;
                        }
                        asyncCallback(err);
                    });
                }
            ], function (err) {
                if (err) {
                    //TODO
                    console.log('SPARQL ERROR: ' + err.message);
                }
                sendResp(videoInfo);
            }
        )
    } else {
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
                                console.log(LOG_TAG + 'getEntit' + data);
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
                        if (err) {
                            //TODO
                            console.log(LOG_TAG + 'ERR - ' + JSON.stringify(err));
                            if (!response) {
                                sendResp(null);
                                return;
                            }
                        }

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
        } else {
            sendResp(null);
        }
    }
}
exports.sparql = function (req, res) {
    var uuid = req.param('uuid');
    ts.getLocator(uuid, function (err, data) {
        console.log('BBBBBBBBBBBBBB');
        if (err) {
            res.send(data);
            return;
        }
        if (data.type != 'uri') {
            //TODO
        }
        var videoURI = data.value;

        viewVideo(req, res, videoURI, uuid, true);
    });
};
exports.view = function (req, res) {
    var uuid = req.param('uuid');
    if (!uuid) {
        res.redirect('/');
        return;
    }
    db.getLocator(uuid, function (err, data) {
        if (err) {
            //TODO a 404 page
            res.redirect('/');
            return;
        }

        var videoURI = data.locator;

        viewVideo(req, res, videoURI, uuid);
    });

};

exports.search = function (req, res) {
    var videoURI = req.query.uri;
    if (!videoURI) {
        res.redirect('/');
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

    db.insert(locator, function (err, data) {
        if (err) {
            console.log("DATABASE ERROR" + JSON.stringify(err));
            //TODO error page
            res.redirect('/');
            return;
        } else {
            var uuid = data.uuid;
            var hashPart = parsedURI.hash || '';
            var redirectUrl = '/video/' + uuid + fragPart + hashPart;
            console.log('Redirecting to ' + redirectUrl);
            res.redirect(redirectUrl);
        }
    });

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
        console.log(LOG_TAG + 'nerdifying form cache ' + cacheKey);
        var source = {
            videoInfo: info,
            enriched: true
        };
        res.render('nerdify_resp.ejs', source);

    }
};

function getEntities(video_info, callback) {
    var doc_type, text;
    if (video_info.timedtext) {
        doc_type = 'timedtext';
        text = video_info.timedtext;
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
                            video_info.comments = data.entry.gd$comments ? data.entry.gd$comments.gd$feedLink.countHint : 0;
                            video_info.likes = data.entry.yt$rating ? data.entry.yt$rating.numLikes : 0;
                            video_info.avgRate = data.entry.gd$rating ? data.entry.gd$rating.average : 0;
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
                            video_info.timedtext = false;
                            async_callback(true);
                        } else {
                            video_info.timedtext = data;
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
                function (async_callback) {
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
                            async_callback(false);
                        } else {
                            //TODO
                            async_callback(true);
                        }
                    })
                },
                function (async_callback) {
                    getDailymotionSub(video_info.video_id, function (err, data) {
                        if (err) {
                            console.log(err);
                            video_info.timedtext = false;
                            async_callback(false);
                        } else {
                            video_info.timedtext = data;
                            async_callback(false);
                        }
                    });
                }
            ], function (err) {
                console.log('done');
                callback(err, video_info);
            });
            break;
        case 'vimeo':
            async.parallel([
                function (async_callback) {
                    var json_url = 'http://vimeo.com/api/v2/video/' + video_info.video_id + '.json';
                    console.log('retrieving metadata from ' + json_url);
                    http.getJSON(json_url, function (err, data) {
                        if (!err) {
                            video_info.title = data.title;
                            video_info.thumb = data.thumbnail_small;
                            video_info.descr = data.description.replace(new RegExp('<br />', 'g'), '\n');
                            video_info.views = data.stats_number_of_plays;
                            video_info.favourites = "n.a.";
                            video_info.comments = data.stats_number_of_comments;
                            video_info.likes = data.stats_number_of_likes;
                            video_info.avgRate = "n.a.";
                            video_info.published = data.upload_date;
                            video_info.category = data.tags;
                            async_callback(false);
                        } else {
                            //TODO
                            async_callback(true);
                        }
                    });
                },
                function (async_callback) {
                    getVimeoSub(video_info.video_id, function (err, data) {
                        if (err) {
                            console.log('Retrieving sub with error');
                            video_info.timedtext = false;
                            async_callback(false);
                        } else {
                            video_info.timedtext = data;
                            async_callback(false);
                        }
                    });
                }
            ], function (err) {
                callback(err, video_info);
            });
            break;
        case 'ted':
            async.parallel([
                function (async_callback) {
                    var json_url = 'https://api.ted.com/v1/talks/' + video_info.video_id + '.json?api-key=uzdyad5pnc2mv2dd8r8vd65c';
                    console.log('retrieving metadata from ' + json_url);
                    http.getJSON(json_url, function (err, data) {
                        if (err) {
                            //TODO
                            async_callback(true);
                        } else {
                            video_info.title = data.talk.name;
                            video_info.thumb = data.talk.images[1].image.url;
                            video_info.descr = data.talk.description.replace(new RegExp('<br />', 'g'), '\n');
                            video_info.views = data.talk.viewed_count;
                            video_info.comments = data.talk.commented_count;
                            video_info.published = data.talk.published_at;
                            video_info.event = data.talk.event.name;


                            async_callback(false);
                        }
                    })
                },
                function (async_callback) {
                    getTedSub(video_info.video_id, function (err, data) {
                        if (err) {
                            console.log('Retrieving sub with error');
                            video_info.timedtext = false;
                            async_callback(false);
                        } else {
                            video_info.timedtext = data;
                            async_callback(false);
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

exports.ajaxGetMetadata = function (req, res) {
    var uuid = req.param('uuid');
    if (!uuid) {
        res.json({error: 'empty uuid'});
        return;
    }
    db.getLocator(uuid, function (err, data) {
        console.log(JSON.stringify(data));
        if (err) {
            res.json({error: 'video not found in db'});
            return;
        }

        var videoURI = data.locator;
        var vendor = detectVendor(videoURI);
        if (!vendor) {
            res.json({error: 'vendor not recognized or not supported'});
            return;
        }
        var id = detectId(videoURI, vendor);

        if (!id) {
            res.json({error: 'error in detecting id for ' + vendor.name + ' video.'});
            return;
        }

        getMetadata(id, vendor, function (err, data) {
            res.json(data);
        });

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
                console.log('no sub available')
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
    http.getJSON(subListUrl, function (err, data) {
        if (err) {
            //TODO
        } else {
            if (data.total > 0) {
                for (var i = 0; i < data.total; i++) {


                    var sub_startTime = data;
                    var sub_duration = data.talk.description.replace(new RegExp('<br />', 'g'), '\n');
                    var sub_content = data.talk.viewed_count;
                }
            }
            var mysrt = jsonToSrt(sub_startTime, sub_duration, sub_content);
            callback(mysrt);

        }
    });
}
function jsonToSrt() {

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

