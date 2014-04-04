/**
 * Created by Marella Sabatino on 04/04/2014.
 */
var uri = videoURI;

$(document).ready(function () {

    var mfuri = uri; //Media Fragment URI

    //initialise smfplayer
    var $player = $("#video").smfplayer({
        mfURI: mfuri
    });


    var parsedJSON = MediaFragments.parseMediaFragmentsUri(mfuri);
    var MEstart = (parsedJSON.hash.t[0].start || parsedJSON.query.t[0].start) * 1000; //media frame starting point in milliseconds
    var MEend = (parsedJSON.hash.t[0].end || parsedJSON.query.t[0].end) * 1000; //media frame ending point in milliseconds


    $('#parsed').text(parsedJSON);


    setTimeout(function () {


        var $player_width = $(".mejs-time-total").width();
        var $player_height = $(".mejs-time-total").height();
        var $highligthedMF = $("#mfDiv");
        $highligthedMF.height(2 * $player_height);
        $highligthedMF.width($player_width);

        setTimeout(function () {
            var $totDuration = $player.getDuration();
            var $timeUnit = $player_width / $totDuration;

            $highligthedMF.width((MEend - MEstart) * $timeUnit); //width of Media Frame Highlighting

            $highligthedMF.offset({ left: ($(".mejs-button").width() + $(".mejs-time").width() + MEstart * $timeUnit) });
            console.log($highligthedMF.position());

            console.log($totDuration);
            console.log($timeUnit);
            //var $MEstart = MediaFragments.time

        }, 1000);

        }, 800);
    }, 150);


});
