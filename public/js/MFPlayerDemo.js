var uri = videoURI.replace(new RegExp('&amp;', 'g'), '&');

$(document).ready(function () {
        var mfuri = uri; //Media Fragment URI
        //initialise smfplayer
        var $player = $("#video").smfplayer({
            mfURI: mfuri,
            ontimeready: highlight
        });


        $("#mfDiv").appendTo($(".mejs-controls"));

        function highlight() {
            var player_width = $(".mejs-time-total").width(); //total width of timeline
            var player_height = $(".mejs-time-total").height();

            var $highligthedMF = $('#mfDiv');
            if ($highligthedMF.length == 0) {
                $highligthedMF = $("<div>").attr('id', 'mfDiv');
                $highligthedMF.height(player_height);
            }

            var totDuration = $player.getDuration();
            var timeUnit = player_width / totDuration;

            var parsedJSON = $player.getMFJson();

            if (arguments.length == 2) {
                MEstart = arguments[0];
                MEend = arguments[1];
            } else {
                var MEt = parsedJSON.hash.t || parsedJSON.query.t;
                if (typeof MEt != 'undefined') {
                    var MEstart = MEt[0].startNormalized * 1000; //media frame starting point in milliseconds
                    var MEend = MEt[0].endNormalized * 1000; //media frame ending point in milliseconds

                    MEend = (MEend > 0) ? MEend : totDuration;

                }
            }

            if (MEstart && MEend) {
                $highligthedMF.css("left", $(".mejs-playpause-button").outerWidth() + $(".mejs-currenttime-container").outerWidth() + (MEstart * timeUnit) + 5);
                $highligthedMF.width(Math.ceil((MEend - MEstart) * timeUnit)); //width of Media Frame Highlighting
                $highligthedMF.appendTo($(".mejs-controls")).show();
            }
        }

        $('.see-all').click(function () {
            var $this = $(this);
            var $target = $('#' + $this.attr('for'));
            $target.toggleClass('full');
            var text = $target.hasClass('full') ? 'see less' : 'see more';
            $this.text(text)
        });

        var $subCont = $('#sub-cont');
        if (Modernizr.history) {

            var $nerdifyForm = $('form.nerdify');
            var ajaxAction = $nerdifyForm.data('action');

            $nerdifyForm.attr('action', ajaxAction).submit(function (e) {
                e.preventDefault();
                var $form = $(this);
                var $submitButton = $('button[type="submit"]', $form);
                $submitButton.prop('disabled', true).addLoader('left');
                $form.ajaxSubmit({
                    success: function (data) {
                        var $data = $(data);
                        var $subText = $data.find('.sub-text');
                        if ($subText.exists()) {
                            var $actualSubText = $('.sub-text', $subCont);
                            $actualSubText.replaceWith($subText);
                        } else {
                            var $descr = $data.find('.descr');
                            var $actualDescr = $('#descr');
                            if ($actualDescr.hasClass('full')) {
                                $descr.addClass('full');
                            }
                            $actualDescr.replaceWith($descr);
                        }
                        var $entSect = $data.find('#entity-sect').hide();
                        $('#playlist-sect').append($entSect);
                        $entSect.fadeIn();

                        $('form.nerdify').fadeOut();
                        $submitButton.prop('disabled', false).removeLoader();

                        var joinSymbol = location.search ? '&' : '?';
                        var new_url = location.href + joinSymbol + 'enriched=true';
                        history.pushState(null, null, new_url);

                        $(window).off('popstate.nerdify').on('popstate.nerdify', function () {
                            if (getParameterByName('enriched')) {
                                $entSect.fadeIn();
                                $('form.nerdify').fadeOut();
                                if ($subText.exists()) {
                                    $actualSubText.replaceWith($subText);
                                } else {
                                    $actualDescr.replaceWith($descr);
                                }
                            } else {
                                $entSect.fadeOut();
                                $('form.nerdify').fadeIn();
                                if ($subText.exists()) {
                                    $subText.replaceWith($actualSubText);
                                } else {
                                    $descr.replaceWith($actualDescr);
                                }
                            }
                        });
                    },
                    error: function () {
                        console.error('Something went wrong');
                    }
                });
            });
        }
        $(document).on('click', '.entity', function () {
            var startEntity = $(this).children('a').data('start-time') * 1000;
            var endEntity = $(this).children('a').data('end-time') * 1000;

            $player.setPosition(startEntity);
            $player.play();
            highlight(startEntity, endEntity);
            var waitFragEndListener = function (event) {
                if (endEntity != null && $player.getPosition() >= endEntity) {
                    $player.pause();
                    $player.getMeplayer().media.removeEventListener(waitFragEndListener);
                    endEntity = null;
                }
            };

            $player.getMeplayer().media.addEventListener('timeupdate', waitFragEndListener, false);
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
                }
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
                }
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

    }
)
;


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
function getParameterByName(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);
    return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}
