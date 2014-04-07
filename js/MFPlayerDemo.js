/**
 * Created by Mariella Sabatino on 04/04/2014.
 */
var uri = videoURI;

$(document).ready(function () {

    var mfuri = uri; //Media Fragment URI

    //initialise smfplayer
    var $player = $("#video").smfplayer({
        mfURI: mfuri
    });


    var parsedJSON = MediaFragments.parseMediaFragmentsUri(mfuri);
    var MEstart = (parsedJSON.hash.t[0].start * 1000) || ((parsedJSON.query.t[0].start) * 1000) || (mfuri.start * 1000); //media frame starting point in milliseconds
    var MEend = (parsedJSON.hash.t[0].end * 1000) || (parsedJSON.query.t[0].end * 1000) || (mfuri.end * 1000); //media frame ending point in milliseconds


    $('#parsed').text(parsedJSON);


    var video_tag = $("div#mep_0").find("video");
    if (video_tag.readyState == 4){
        console.log(video_tag);
        highlight();
    }


    function highlight() {
        console.log("stoqquà!");
        var $player_width = $(".mejs-time-total").width(); //total width of timeline
        var $player_height = $(".mejs-time-total").height();
        var $highligthedMF = $("#mfDiv");
        $highligthedMF.height($player_height);
        console.log($player_height);
        console.log($player_width);

        video_tag.onloadeddata = puppa();

        function puppa() {
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


});
