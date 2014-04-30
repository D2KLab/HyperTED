var uri = video.uri.replace(new RegExp('&amp;', 'g'), '&') + window.location.hash;
var storageKey = 'fragmentenricher.';
var videokey = storageKey + video.vendor + '-' + video.id + '.';

$(document).ready(function () {
    var $subCont = $('#sub-cont');
    var hasVideoSub = $subCont.exists();
    var parsedJSON;

    var mfuri = uri; //Media Fragment URI
    //initialise smfplayer
    var $player = $("#video").smfplayer({
        mfURI: mfuri,
        spatialOverlay: true,
        temporalHighlight: true
    });
    video.player = $player;



    $('.see-all').click(function () {
        var $this = $(this);
        var $target = $('#' + $this.attr('for'));
        $target.toggleClass('full');
        var text = $target.hasClass('full') ? 'see less' : 'see more';
        $this.text(text)
    });

    if (Modernizr.history && Modernizr.localstorage) {
        var $nerdifyForm = $('form.nerdify');
        var ajaxAction = $nerdifyForm.data('action');
        var $nerdified = $('.enriched').exists() ? $('.enriched') : undefined;
        var $plain = $nerdified ? undefined : (hasVideoSub ? $('.sub-text') : $('#descr'));
        var $entSect = $('#entity-sect').exists() ? $('#entity-sect') : undefined;

        $nerdifyForm.attr('action', ajaxAction).submit(function (e) {
            e.preventDefault();
            var $submitButton = $('button[type="submit"]', $nerdifyForm);
            $submitButton.prop('disabled', true).addLoader('left');

            var joinSymbol = location.search ? '&' : '?';
            var new_url = location.href + joinSymbol + 'enriched=true';

            $entSect = $entSect || localStorage[videokey + 'ent-sect'];
            $nerdified = $nerdified || localStorage[videokey + 'nerd'];
            $plain = $plain || localStorage[videokey + 'plain'];
            if ($nerdified && $plain && $entSect) {
                $submitButton.prop('disabled', false).removeLoader();
                history.pushState(null, null, new_url);
                synchEnrichment();
                return false;
            }

            $(this).ajaxSubmit({
                success: function (data) {
                    var $data = $(data);
                    if (hasVideoSub) {
                        $nerdified = $data.find('.sub-text');
                        $plain = $('.sub-text', $subCont);
                    } else {
                        $nerdified = $data.find('.descr');
                        $plain = $('#descr');
                        if ($plain.hasClass('full')) {
                            $nerdified.addClass('full');
                        }
                    }

                    $entSect = $data.find('#entity-sect').hide();
                    $('#playlist-sect').append($entSect);

                    try {
                        localStorage[videokey + 'ent-sect'] = $entSect[0].outerHTML;
                        localStorage[videokey + 'nerd'] = $nerdified[0].outerHTML;
                        localStorage[videokey + 'plain'] = $plain[0].outerHTML;
                    } catch (e) {
                        if (e == QUOTA_EXCEEDED_ERR) {
                            console.warn('Quota exceeded! Delete all and write');
                            localStorage.clear();
                            localStorage[videokey + 'ent-sect'] = $entSect[0].outerHTML;
                            localStorage[videokey + 'nerd'] = $nerdified[0].outerHTML;
                            localStorage[videokey + 'plain'] = $plain[0].outerHTML;
                        }
                    }

                    $submitButton.prop('disabled', false).removeLoader();
                    history.pushState(null, null, new_url);
                    synchEnrichment();
                },
                error: function () {
                    console.error('Something went wrong');
                }
            });
        });

        $(window).off('popstate.nerdify').on('popstate.nerdify', function () {
            synchEnrichment();
        });

        function synchEnrichment() {
            var isEnriched = getParameterByName('enriched');
            $entSect = $entSect || localStorage[videokey + 'ent-sect'];
            $nerdified = $nerdified || localStorage[videokey + 'nerd'];
            $plain = $plain || localStorage[videokey + 'plain'];

            if (isEnriched) {
                if ($entSect && $nerdified) {
                    $nerdified = $($nerdified);
                    $plain = $($plain);
                    $entSect = $($entSect);

                    $entSect.fadeIn();
                    $nerdifyForm.fadeOut();
                    $('.sub-text').not('.enriched').replaceWith($nerdified);
                } else {
                    // submit form
                    $nerdifyForm.submit();
                }
            } else {
                if (!$plain) {
                    //refresh page for taking info from server
                    location.reload();
                } else {
                    $nerdified = $($nerdified);
                    $plain = $($plain);
                    $entSect = $($entSect);

                    $entSect.fadeOut();
                    $nerdifyForm.fadeIn();
                    $('.sub-text.enriched').replaceWith($plain);
                }
            }
        }
    }

    $(document).on('click', '.entity', function () {
        var $entity = $(this).children('a');
        var startEntity = $entity.data('start-time');
        var endEntity = $entity.data('end-time');
        $player.setmf('t=' + startEntity + ',' + endEntity).playmf();
        updateMFurl();
    });

    $(document).on('click', '.sub-text p[data-time]', function () {
        var srtTime = $(this).data('time');
        var hms = srtTime.replace(/,/g, '.').replace(' --> ', ',');
        $player.setmf('t=' + hms).playmf();
        updateMFurl();
    });


    function updateMFurl() {
        if (Modernizr.history) {
            parsedJSON = $player.getMFJson();
            var video_url = mfuri.parseURL();
            var hash = parsedJSON.hash;
            if (!$.isEmptyObject(hash)) {
                for (var key in hash) {
                    video_url.hash[key] = hash[key][0].value;
                }
            } else {
                video_url.hash = {};
            }

            var page_url = window.location.toString().parseURL();
            delete page_url.search.t;
            delete page_url.search.xywh;
            page_url.hash = {};

            page_url.search.uri = video_url.toString();
            history.pushState(null, null, page_url.toString());
        }
    }


    $(window).off('popstate.changemf').on('popstate.changemf', function () {
        var page_url = window.location.toString().parseURL();
        var frag;
        var t = page_url.search.t || page_url.hash.t;
        if (t) {
            frag = 't=' + t;
        }
        var xywh = page_url.search.xywh || page_url.hash.xywh;
        if (xywh) {
            frag = frag ? frag + '&' + 'xywh=' + xywh : 'xywh=' + xywh;
        }

        $player.setmf(frag);
        updateMFurl();
    });

    $('.video-list .video-link').each(function () {
        var $li = $(this);
        var video_url = $li.data('url');
        if (typeof video_url != 'undefined' && video_url != "") {

            retrieveInfo(video_url, function (video_info) {
                $('h4 a', $li).text(video_info.title).attr('alt', video_info.title);
                var $thumb = $('<img>').attr('src', video_info.thumb).addClass('thumb');
                $('.thumb-cont', $li).attr('title', video_info.title).append($thumb);

                $('.loader', $li).hide();
                $('.content', $li).show(function () {
                    $(this).addClass('visible');
                });
            });

            $('.frag-link a', $li).click(function () {
                var frag_param = $(this).data('frag') || "";
                var complete_url = video_url + frag_param;

                var $form = $('#video-search');
                $('input[name=uri]').val(complete_url);
                $form.submit();
            });
        }
    });

    function retrieveInfo(uri, callback, full) {
        var video_info = {};
        if (smfplayer.utils.isYouTubeURL(uri)) {
            video_info.video_id = uri.match(/v=(.{11})/)[1];
            video_info.vendor = 'youtube';
            var retriveSub = function () {
                return;
            };
            if (full) {
                retriveSub = $.get;
            }

            $.when(
                $.getJSON('http://gdata.youtube.com/feeds/api/videos/' + video_info.video_id + '?v=2&alt=json-in-script&callback=?', function (data) {
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
                }),
                retriveSub('./srt?video_id=' + video_info.video_id + '&vendor=youtube', function (data) {
                    video_info.sub = data;
                })
            ).then(function () {
                    callback(video_info);
                }, function () {
                    callback(video_info);
                });
        } else if (smfplayer.utils.isDailyMotionURL(uri)) {
            video_info.video_id = uri.match(/video\/([^_||^#]+)/)[1];
            video_info.vendor = 'dailymotion';

            var retrieveSub = function () {
                return;
            };
            if (full) {
                retrieveSub = $.get;
            }

            $.when(
                $.getJSON('https://api.dailymotion.com/video/' + video_info.video_id + '?fields=title,thumbnail_60_url,description,views_total,bookmarks_total,comments_total,ratings_total,rating,created_time,genre&callback=?', function (data) {
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
                }),
                retrieveSub('./srt?video_id=' + video_info.video_id + '&vendor=dailymotion', function (data) {
                    video_info.sub = data;
                })
            ).then(function () {
                    callback(video_info);
                }, function () {
                    callback(video_info);
                });
        }
        //TODO other video platforms
    }

});

jQuery.fn.extend({
    addLoader: function (direction) {
        if (!jQuery.loaderImg) {
            jQuery.loaderImg = $("<img>").attr('src', 'img/ajax-loader.gif');
        }

        var $loaderImg = jQuery.loaderImg;
        jQuery.loaderImg = $loaderImg.clone();
        if (direction == 'left') {
            $(this).before($loaderImg);
        } else {
            $(this).after($loaderImg);
        }
        $(this).data('loader', $loaderImg);
        return true;
    },
    removeLoader: function () {
        var loader = $(this).data('loader');
        $(loader).remove();
    },
    exists: function () {
        return $(this).length > 0;
    }
});

function getParameterByName(name, url) {
    var URL = url || location.search;
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(URL);
    return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

String.prototype.parseURL = function () {
    if (typeof this != "string" && !(this instanceof String))
        throw "You can use parseURL only on strings";

    var parser = document.createElement('a');
    parser.href = this + '';

    var searchPart = parser.search ? parser.search.substring(1).split('&') : undefined;
    if (searchPart) {
        var searchList = {};
        searchPart.forEach(function (s) {
            s = s.split('=', 2);
            searchList[s[0]] = s[1];
        });

        searchPart = searchList;
    } else {
        searchPart = {};
    }

    var hashPart = parser.hash ? parser.hash.substring(1).split('&') : undefined;
    if (hashPart) {
        var hashList = {};
        hashPart.forEach(function (s) {
            s = s.split('=', 2);
            hashList[s[0]] = s[1];
        });

        hashPart = hashList;
    } else {
        hashPart = {};
    }

    return {
        protocol: parser.protocol,
        hostname: parser.hostname,
        port: parser.port,
        pathname: parser.pathname,
        search: searchPart,
        hash: hashPart,
        host: parser.host,
        toString: function () {
            var joinSymbol;
            var search = '';
            if (Object.keys(this.search).length > 0) {
                joinSymbol = '?';
                for (var sKey in this.search) {
                    if (this.search.hasOwnProperty(sKey)) {
                        search += joinSymbol + sKey + '=' + this.search[sKey];
                        joinSymbol = '&';
                    }
                }
            }
            var hash = '';
            if (Object.keys(this.hash).length > 0) {
                joinSymbol = '#';
                for (var hKey in this.hash) {
                    if (this.hash.hasOwnProperty(hKey)) {
                        hash += joinSymbol + hKey + '=' + this.hash[hKey];
                        joinSymbol = '&';
                    }
                }
            }
            return this.protocol + '//' + this.host + this.pathname + search + hash;
        }
    };
};