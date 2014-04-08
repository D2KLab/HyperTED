var uri = videoURI;

$(document).ready(function () {
    var mfuri = uri; //Media Fragment URI
    var hightlighted = false;

    //initialise smfplayer
    var $player = $("#video").smfplayer({
        mfURI: mfuri,
        ontimeready: highlight
    });


    function highlight() {
        if (hightlighted) return;
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

            $highligthedMF.offset({ left: ($(".mejs-button").outerWidth() + $(".mejs-currenttime-container").outerWidth() + (MEstart * $timeUnit) + 15) });
            console.log($(".mejs-button").outerWidth() + $(".mejs-currenttime-container").outerWidth() + (MEstart * $timeUnit) + 15);
            $highligthedMF.width((MEend - MEstart) * $timeUnit); //width of Media Frame Highlighting
        }

        hightlighted = true;
    }

    if (smfplayer.utils.isYouTubeURL(uri)) {
        var video_id = uri.match(/v=(.{11})/)[1];

        function youtubeFeedCallback(data) {
            var video_title = data.entry.title.$t;

            var $video_title = $('<h1>');
            $video_title.text(video_title)
            $('#video-title').append($video_title);
        }

        window.youtubeFeedCallback = youtubeFeedCallback;

        $.getScript('http://gdata.youtube.com/feeds/api/videos/' + video_id + '?v=2&alt=json-in-script&callback=youtubeFeedCallback');
    }
    //TODO other video platforms
});
