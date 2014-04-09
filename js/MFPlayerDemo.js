var uri = videoURI;

$(document).ready(function () {
    var mfuri = uri; //Media Fragment URI

    //initialise smfplayer
    var $player = $("#video").smfplayer({
        mfURI: mfuri,
        ontimeready: highlight
    });


    $("#mfDiv").appendTo($(".mejs-controls"));

    function highlight() {
        var $player_width = $(".mejs-time-total").width(); //total width of timeline
        var $player_height = $(".mejs-time-total").height();
        var $highligthedMF = $("#mfDiv");
        $highligthedMF.height($player_height);

        var $totDuration = $player.getDuration();
        var $timeUnit = $player_width / $totDuration;

        var parsedJSON = $player.getMFJson();

        var MEt = parsedJSON.hash.t || parsedJSON.query.t;
        if (typeof MEt != 'undefined') {
            var MEstart = MEt[0].start * 1000; //media frame starting point in milliseconds
            var MEend = MEt[0].end * 1000; //media frame ending point in milliseconds

            $highligthedMF.css({ left: ($(".mejs-playpause-button").outerWidth() + $(".mejs-currenttime-container").outerWidth() + (MEstart * $timeUnit)) + 5 });
            $highligthedMF.width((MEend - MEstart) * $timeUnit); //width of Media Frame Highlighting
        }

        hightlighted = true;
    }

    retriveInfo(uri, function (video_info) {
        $('#video-title').text(video_info.title);

        var $videoInfo = $('#video-info');

        var $rightCol=$('<div>').addClass('right-col');
        var $leftCol=$('<div>').addClass('left-col');
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
                $('h4 a', $li).text(video_info.title).attr('alt', video_info.title).attr('href', video_url);
                var $thumb = $('<a>').attr('href', video_url).attr('alt', video_info.title).append($('<img>').attr('src', video_info.thumb).addClass('thumb'));
                $('.content', $li).prepend($thumb);

                $('.loader', $li).hide();
                $('.content', $li).show(function () {
                    $(this).addClass('visible');
                });
            });
        }
    });

    function statDiv(key, value, glyph) {
        if (value == undefined || value == null) return null;

        var $stat = $('<div>').addClass('stat');

        if (glyph) {
            $stat.append($('<span>').addClass('key glyphicon glyphicon-'+glyph).attr('title',key));
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
        }
        //TODO other video platforms
    }


});
