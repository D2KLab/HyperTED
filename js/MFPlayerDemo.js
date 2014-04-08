var uri = videoURI;

$(document).ready(function () {
    var mfuri = uri; //Media Fragment URI

    //initialise smfplayer
    var $player = $("#video").smfplayer({
        mfURI: mfuri
    });

    var parsedJSON = $player.getMFJson();
    var MEt = parsedJSON.hash.t || parsedJSON.query.t;
    if (typeof Met != 'undefined') {
        var MEstart = MEt[0].start * 1000; //media frame starting point in milliseconds
        var MEend = MEt[0].end * 1000; //media frame ending point in milliseconds
    }

    $('#parsed').text(parsedJSON);


    var video_tag = $("div#mep_0").find("video");



    window.video_tag = video_tag[0];

    if (video_tag.get(0).readyState === 4) {
        console.log('yayyyyy');
        highlight();

    }
//    video_tag[0].oncanplay = function () {
//        console.log('********');
//        highlight();
//    }

//    setInterval(function () {
//        console.log(video_tag.get(0).readyState);
//    },1000);


    function highlight() {
        console.log("stoqquà!");
        var $player_width = $(".mejs-time-total").width(); //total width of timeline
        var $player_height = $(".mejs-time-total").height();
        var $highligthedMF = $("#mfDiv");
        $highligthedMF.height($player_height);
        console.log($player_height);
        console.log($player_width);

        video_tag.onloadedmetadata = highlight_pos();

        function highlight_pos() {
            console.log("emmostoqquà!");
            var $totDuration = $player.getDuration();
            var $timeUnit = $player_width / $totDuration;


            $highligthedMF.offset({ left: ($(".mejs-button").outerWidth() + $(".mejs-currenttime-container").outerWidth() + (MEstart * $timeUnit) + 15) });

            $highligthedMF.width((MEend - MEstart) * $timeUnit); //width of Media Frame Highlighting

            setTimeout(function () {
                console.log(MEend * $timeUnit);
                console.log(MEstart * $timeUnit);

                console.log($totDuration);
                console.log($timeUnit);

            }, 3000);


        }

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