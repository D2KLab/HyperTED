var uri = videoURI;

$(document).ready(function () {
    var mfuri = uri; //Media Fragment URI

    //initialise smfplayer
    var $player = $("#video").smfplayer({
        mfURI: mfuri,
        ontimeready: highlight
    });


    $( "#mfDiv" ).appendTo( $(".mejs-controls") );

    function highlight() {
        var $player_width = $(".mejs-time-total").width(); //total width of timeline
        var $player_height = $(".mejs-time-total").height();
        var $highligthedMF = $("#mfDiv");
        $highligthedMF.height($player_height);

        var $totDuration = $player.getDuration();
        var $timeUnit = $player_width / $totDuration;

        var parsedJSON = $player.getMFJson();
        $('#parsed').text(parsedJSON);

        var MEt = parsedJSON.hash.t || parsedJSON.query.t;
        if (typeof MEt != 'undefined') {
            var MEstart = MEt[0].start * 1000; //media frame starting point in milliseconds
            var MEend = MEt[0].end * 1000; //media frame ending point in milliseconds

            $highligthedMF.css({ left: ($(".mejs-playpause-button").outerWidth() + $(".mejs-currenttime-container").outerWidth() + (MEstart * $timeUnit)) + 5 });
            $highligthedMF.width((MEend - MEstart) * $timeUnit); //width of Media Frame Highlighting
        }

        hightlighted = true;
    }

    retriveInfo(uri, function (data) {
        var video_title = data.entry.title.$t;

        $('#video-title').text(video_title)
    });


    $('.video-list .video-link').each(function () {
        var $li = $(this);
        var video_url = $li.data('url');
        if (typeof video_url != 'undefined' && video_url != "") {

            retriveInfo(video_url, function (data) {
                var video_title = data.entry.title.$t;
                var video_thumb = data.entry.media$group.media$thumbnail[0].url;
                $('h4 a', $li).text(video_title).attr('alt', video_title).attr('href', video_url);
                var $thumb = $('<a>').attr('href', video_url).attr('alt', video_title).append($('<img>').attr('src', video_thumb).addClass('thumb'));
                $('.content', $li).prepend($thumb);

                $('.loader', $li).hide();
                $('.content', $li).show(function () {
                    $(this).addClass('visible');
                });
            });
        }
    });

    function retriveInfo(uri, callback) {
        if (smfplayer.utils.isYouTubeURL(uri)) {
            var video_id = uri.match(/v=(.{11})/)[1];

            $.getJSON('http://gdata.youtube.com/feeds/api/videos/' + video_id + '?v=2&alt=json-in-script&callback=?', callback);
        }
        //TODO other video platforms
    }
});
