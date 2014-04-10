var uri = videoURI.replace(new RegExp('&amp;', 'g'), '&');

$(document).ready(function () {
    var mfuri = uri; //Media Fragment URI
    console.log(mfuri);
    //initialise smfplayer
    var $player = $("#video").smfplayer({
        mfURI: mfuri,
        ontimeready: highlight
    });



    function highlight() {
        var player_width = $(".mejs-time-total").width(); //total width of timeline
        var player_height = $(".mejs-time-total").height();
        var $highligthedMF = $("<div>").attr('id','mfDiv');

        $highligthedMF.height(player_height);

        var totDuration = $player.getDuration();
        var timeUnit = player_width / totDuration;

        var parsedJSON = $player.getMFJson();
        console.log(parsedJSON);
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

    retriveInfo(uri, function (video_info) {
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

        $videoInfo.append($('<p>').html(video_info.descr).addClass('descr'));
    });


    $('.video-list .video-link').each(function () {
        var $li = $(this);
        var video_url = $li.data('url');
        if (typeof video_url != 'undefined' && video_url != "") {

            retriveInfo(video_url, function (video_info) {
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

    function retriveInfo(uri, callback) {
        var video_info = {};
        if (smfplayer.utils.isYouTubeURL(uri)) {
            var video_id = uri.match(/v=(.{11})/)[1];
            $.getJSON('http://gdata.youtube.com/feeds/api/videos/' + video_id + '?v=2&alt=json-in-script&callback=?', function (data) {
                video_info.title = data.entry.title.$t
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
});
