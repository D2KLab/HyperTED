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
        var $highligthedMF = $("<div>").attr('id', 'mfDiv');

        $highligthedMF.height(player_height);

        var totDuration = $player.getDuration();
        var timeUnit = player_width / totDuration;

        var parsedJSON = $player.getMFJson();

        var MEt = parsedJSON.hash.t || parsedJSON.query.t;
        if (typeof MEt != 'undefined') {
            var MEstart = MEt[0].startNormalized * 1000; //media frame starting point in milliseconds
            var MEend = MEt[0].endNormalized * 1000; //media frame ending point in milliseconds

            MEend = (MEend > 0) ? MEend : totDuration;

            $highligthedMF.css("left", $(".mejs-playpause-button").outerWidth() + $(".mejs-currenttime-container").outerWidth() + (MEstart * timeUnit) + 5);
            $highligthedMF.width(Math.ceil((MEend - MEstart) * timeUnit)); //width of Media Frame Highlighting
            $highligthedMF.appendTo($(".mejs-controls")).show();
        }

    }

    retrieveInfo(uri, function (video_info) {
        $('#video-title').text(video_info.title);

        var $videoInfo = $('#video-info');

        var $rightCol = $('<div>').addClass('right-col');
        var $leftCol = $('<div>').addClass('left-col');
        $leftCol.append(statDiv('Published', video_info.published));
        $leftCol.append(statDiv('Category', video_info.category));
        $rightCol.append(statDiv('Views', video_info.views, 'eye-open'));
        $rightCol.append(statDiv('Likes', video_info.likes, 'thumbs-up'));
        $rightCol.append(statDiv('Favourites', video_info.favourites, 'star'));
        $rightCol.append(statDiv('AVG Rating', video_info.avgRate, 'signal'));

        $videoInfo.append($('<div>').addClass('stats-cont').append($leftCol).append($rightCol));

        var $videoDesc = $('<p>').html(video_info.descr).addClass('descr');
        var $buttonNerd = $('<button type="submit">').html('Nerdify').addClass('btn btn-danger btn-lg');
        var $hiddenInput = $('<input type="hidden" name="text">').val(video_info.descr);

        var $buttonCont = $('<form>').attr('method', 'GET').attr('action', './nerdify').addClass('button-cont').append($hiddenInput).append($buttonNerd);
        var $descCont = $('<div>').addClass('desc-cont').append($videoDesc).append($buttonCont);
        $videoInfo.append($descCont);

        $buttonCont.submit(function (e) {
            e.preventDefault();
            var $form = $(this);
            $('button[type="submit"]', $form).prop('disabled', true).addLoader('left');
            $form.ajaxSubmit({
                dataType: 'json',
                success: function (responseText) {
                    console.log(responseText);
                    //sorting JSON for Start character desc
                    responseText.sort(function SortByStartChar(x, y) {
                        return ((x.startChar == y.startChar) ? 0 : ((x.startChar > y.startChar) ? -1 : 1 ));
                    });

                    var new_descr = video_info.descr;
                    $.each(responseText, function (key, value) {
                        var entity = value;

                        var s1 = new_descr.substring(0, entity.startChar);
                        var s2 = new_descr.substring(entity.startChar, entity.endChar);
                        var s3 = new_descr.substring(entity.endChar);

                        new_descr = s1 + '<span class="entity ' + entity.nerdType.split('#')[1].toLowerCase() + '"><a href="' + entity.uri + '">' + s2 + '</a></span>' + s3;

                    });
                    $descCont.html(new_descr);
                },
                error: function () {
                    console.log('Something went wrong');
                }
            });
        });
    });

    retrieveSubtitles(uri, function (video_info) {
        var $descCont = $('.desc-cont');

        var $buttonNerdSub = $('<button type="submit">').html('Nerdify Sub').addClass('btn btn-danger btn-lg');
        var $hiddenInputSub = $('<input name="text">').val(video_info.sub_text);
        var $subStamp = $('<div>').addClass('subs-cont');
        var $buttonContSub = $('<form>').attr('method', 'GET').attr('action', './nerdify').addClass('button-cont-sub').append($hiddenInputSub).append($buttonNerdSub);
        $descCont.append($buttonContSub).append($subStamp);

        $buttonContSub.submit(function (e) {
            e.preventDefault();
            var $form = $(this);
            $('button[type="submit"]', $form).prop('disabled', true).addLoader('left');


            $form.ajaxSubmit({

                success: function () {
                    console.log("SUCCESS");
                    ($subStamp).load(video_info.sub_url);
                },
                error: function () {
                    console.log('Something went wrong');
                }
            });
        });

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


    function statDiv(key, value, glyph) {
        if (value == undefined || value == null) return null;

        var $stat = $('<div>').addClass('stat');

        if (glyph) {
            $stat.append($('<span>').addClass('key glyphicon glyphicon-' + glyph).attr('title', key));
            $stat.addClass('little');
        } else {
            $stat.append($('<label>').addClass('key').text(key));
        }
        $stat.append($('<span>').addClass('value').text(value));

        return $stat;
    }

    function retrieveInfo(uri, callback) {
        var video_info = {};
        if (smfplayer.utils.isYouTubeURL(uri)) {
            var video_id = uri.match(/v=(.{11})/)[1];
            $.getJSON('http://gdata.youtube.com/feeds/api/videos/' + video_id + '?v=2&alt=json-in-script&callback=?', function (data) {
                video_info.title = data.entry.title.$t;
                video_info.thumb = data.entry.media$group.media$thumbnail[0].url;
                video_info.descr = data.entry.media$group.media$description.$t;
                video_info.views = data.entry.yt$statistics.viewCount;
                video_info.favourites = data.entry.yt$statistics.favoriteCount;
                video_info.comments = data.entry.gd$comments.gd$feedLink.countHint;
                video_info.likes = data.entry.yt$rating.numLikes;
                video_info.avgRate = data.entry.gd$rating.average;
                video_info.published = data.entry.published.$t;
                video_info.category = data.entry.category[1].term;

                callback(video_info);
            });
        } else if (smfplayer.utils.isDailyMotionURL(uri)) {
            var video_id = uri.match(/video\/([^_||^#]+)/)[1];
            $.getJSON('https://api.dailymotion.com/video/' + video_id + '?fields=title,thumbnail_60_url,description,views_total,bookmarks_total,comments_total,ratings_total,rating,created_time,genre&callback=?', function (data) {
                video_info.title = data.title;
                video_info.thumb = data.thumbnail_60_url;
                video_info.descr = data.description;
                video_info.views = data.views_total;
                video_info.favourites = data.bookmarks_total;
                video_info.comments = data.comments_total;
                video_info.likes = data.ratings_total;
                video_info.avgRate = data.rating;
                video_info.published = data.created_time;
                video_info.category = data.genre;

                callback(video_info);
            });

        }
        //TODO other video platforms
    }

    function retrieveSubtitles(uri, callback) {
        var video_info = {};
        if (smfplayer.utils.isDailyMotionURL(uri)) {
            var video_id = uri.match(/video\/([^_||^#]+)/)[1];
            $.getJSON('https://api.dailymotion.com/video/' + video_id + '/subtitles?fields=id,language%2Curl&callback=?', function (data) {
                video_info.sub_id = data.list[0].id;
                video_info.sub_language = data.list[0].language;
                video_info.sub_url = (data.list[0].url);
                console.log(video_info.sub_url);

                video_info.sub_text = $('.subs-cont').load(video_info.sub_url);
                    console.log("************retrieve sub");
                    console.log(video_info.sub_text);
                    console.log("*******primo*********");


                callback(video_info);
            });
        }
    }

});

var $loaderImg;
jQuery.fn.extend({
    addLoader: function (direction) {
        if (!$loaderImg) {
            $loaderImg = $("<img>").attr('src', 'img/ajax-loader.gif');
        }

        $tempImg = $loaderImg;
        $loaderImg = $loaderImg.clone();
        if (direction == 'left') {
            $(this).before($loaderImg);
        } else {
            $(this).after($loaderImg);
        }
        return true;
    }
});
