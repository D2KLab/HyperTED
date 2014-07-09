var videoUri = video.uri.replace(new RegExp('&amp;', 'g'), '&') + window.location.hash;
var storageKey = 'fragmentenricher.';
var videokey = storageKey + video.uuid + '.';
var parsedJSON;
var $plainSubCont; //Container for subs with no entities

$(document).ready(function () {
    // resize navbar on scroll
    var $navbar = $('.navbar').not('.navbar-placeholder');
    var navHeight = $navbar.height();
    $(window).scroll(function () {
        $navbar.toggleClass('compact', $(window).scrollTop() > navHeight);
    });

    var $subCont = $('#sub-cont');
    var hasVideoSub = $subCont.exists();

    //init smfplayer
    var $playerSect = $('#player-sect');
    var $player = $("#video").smfplayer({
        mfURI: videoUri,
        spatialOverlay: true,
        temporalHighlight: true,
        width: 640,
        height: 360,
        alwaysShowControls: true,
        preload: 'metadata',
        features: ['playpause', 'current', 'progress', 'duration', 'volume'],
        autoStart: false,  //TODO remove
        success: function (media, domObj) {
            $("#video-info-chapters").fadeIn();
            $(media).one('loadedmetadata', function () {
                displayChapters();
                displayPins();
                if ($player.getMFJson().hash.t != '' && $player.getMFJson().hash.t != 'NULL' && $player.getMFJson().hash.t != undefined) {
                    highlightMFSub($player.getMFJson().hash.t[0].value);
                }
                var $pop = Popcorn(media);
                $('.sub-text p[data-time]').each(function () {
                    var $this = $(this);
                    var thisId = $this.attr('id');
                    if (!thisId || !thisId.length) {
                        return;
                    }
                    $pop.highlightSub({
                        start: Math.round($this.data('startss')),
                        end: Math.round($this.data('endss')),
                        subId: thisId
                    });
                });
            }).on('play', function () {
                $('.info-on-player', $playerSect).hide();
            }).on('pause', function () {
                $('.info-on-player', $playerSect).show();

            });
        }
    });
    video.player = $player;
    console.debug($player);

    if (Modernizr.history && Modernizr.localstorage) {
        var $nerdifyForm = $('form.nerdify');
        var ajaxAction = $nerdifyForm.data('action');

        $nerdifyForm.attr('action', ajaxAction).submit(function (e) {
            e.preventDefault();
            var $submitButton = $('button[type="submit"]', $nerdifyForm);
            $submitButton.prop('disabled', true).addLoader('left');

            var extractor = $('.nerdSelect select', $nerdifyForm).val();
            var page_url = window.location.toString().parseURL();
            page_url.search.enriched = extractor;

            var entitiesLS = getFromLocalStorage(videokey + extractor);
            if (entitiesLS) {
                $submitButton.prop('disabled', false).removeLoader();
                history.pushState(null, null, page_url.toString());
                onEntitiesToShow(entitiesLS);
                return false;
            }

            $(this).ajaxSubmit({
                success: function (data) {
                    try {
                        if (data.error) {
                            var alert = $('<div class="alert alert-danger fade in">').text('Something went wrong. Try again later');
                            alert.appendTo($nerdifyForm).alert();
                            $submitButton.removeLoader();
                            console.error(data.error);
                            return;
                        }
                    } catch (e) {
                        console.error(e);
                        //DO NOTHING
                    }
                    onEntitiesToShow(data);
                    $("#entity-sect").fadeIn();

                    saveInLocalStorage(videokey + extractor, data);

                    $submitButton.prop('disabled', false).removeLoader();
                    history.pushState(null, null, page_url.toString());
                },
                error: function () {
                    var alert = $('<div class="alert alert-danger fade in">').text('Something went wrong. Try again later');
                    alert.appendTo($nerdifyForm).alert();
                    $submitButton.removeLoader();
                    console.error('Something went wrong');
                }
            });
        });
    }


    $plainSubCont = $('.sub-text');
    if (video.entitiesL) {
        onEntitiesToShow(video.entitiesL);
    }

    $(document).on('click', '.entity', function () {
        var $entity = $(this).children('a');
        var startEntity = $entity.data('start-time');
        var endEntity = $entity.data('end-time');
        $player.setmf('t=' + startEntity + ',' + endEntity).playmf();
        updateMFurl();
    });

    $('p > span.entity').has('span').addClass('nesting');


    $(document).on({
        click: function (e) {
            e.preventDefault();
            var chapId = $(this).data('chapter');
            $('#' + chapId).click();

        }
    }, '.sub-text p[data-chapter]');

    $(document).on('click', '.sub-text p[data-time]:not([data-chapter])', function () {
        var srtTime = $(this).data('time');
        var hms = srtTime.replace(/,/g, '.').replace(' --> ', ',');
        $player.setmf('t=' + hms).playmf();
        $('.chap-link').removeClass('selected-chap');
        updateMFurl();
    });


    var $pin = $('.pin');
    $('.qtipEnt').hide();
    $('.qtipTitle').hide();

    $pin.each(function () {
        var $this = $(this);
        $this.qtip({
            content: {
                text: $('.qtipEnt', $this).html(),
                title: $('.qtipTitle', $this).html()
            },
            style: {
                classes: 'qtip-light qtip-rounded',
                padding: '15px',
                tip: 'bottom middle'
            },
            position: {
                my: 'bottom center',
                at: 'top center'
            }
        });


    });

    function calcDivWidth(startTime, endTime) {
        var totWidth = ($player.getDuration() / 1000);
        return((endTime - startTime) / totWidth) * 100;
    }

    function calcSpaceWidth(startTime, oldEndTime) {
        var totWidth = ($player.getDuration() / 1000);
        return ((startTime - oldEndTime) / totWidth) * 100;
    }

    $pin.hide();
    function displayPins() {

        $pin.fadeIn();

        var oldEnd = 0;

        $pin.each(function () {
            var $hotSpot = $(this).children('a');
            var startHS = $hotSpot.data('start-time');
            var endHS = $hotSpot.data('end-time');

            var width = calcDivWidth(startHS, endHS);
            $(this).css("width", width + "%");

            if (oldEnd < startHS) {
                var spaceWidth = calcSpaceWidth(startHS, oldEnd);
                $(this).css("margin-left", spaceWidth + "%");
            }
            oldEnd = endHS;


            $(this).on('click', function () {
                $player.setmf('t=' + startHS + ',' + endHS).playmf();
                updateMFurl();
            });


        });
    }

    $("#video-info-chapters").hide();
    function displayChapters() {
        $("#video-info-chapters").fadeIn();

        var oldChapEnd = 0;
        $('.chap-link').each(function () {

            var $chapter = $(this).children('a');
            var startChapter = $chapter.data('start-time');
            var endChapter = $chapter.data('end-time');

            var chapWidth = calcDivWidth(startChapter, endChapter);
            $(this).css("width", chapWidth + "%");


            if (oldChapEnd < startChapter) {
                var chapSpaceWidth = calcSpaceWidth(startChapter, oldChapEnd);
                $(this).css("margin-left", chapSpaceWidth + "%");
            }
            oldChapEnd = endChapter;

            var $totChapters = $('.chap-link').length;
            var index = $('.chap-line .chap-link').index(this);
            $(this).hover(function () {
                    if ($(this).width() < 175) {
                        var opt = {
                            top: "31px",
                            opacity: "1",
                            "background-color": "#f4f4f4",
                            cursor: "auto"
                        };

                        if (index > Math.floor($totChapters / 2)) {
                            opt.right = 0;
                        }
                        $chapter.children('.chap-timing').css(opt);
                    }
                },
                function () {
                });


            $(this).on('click', function () {
                $player.setmf('t=' + startChapter + ',' + endChapter).playmf();
                var chapNumLast = $('.chap-link').last('.chap-num')[0].innerText;
                var chapNum = $(this).children('.chap-num')[0].innerText;

                $('.chap-link').removeClass('selected-chap');


                console.log($('.chap-link').last('.chap-num'));
                $('.first-part').text("chapter   ");
                $('.selected-chap-num').text("   " + chapNum + "   ");
                $('.last-part').text("   of   " + chapNumLast);
                $(this).addClass('selected-chap');

                updateMFurl();
            });

        });

    }


    function updateMFurl() {
        if (Modernizr.history) {
            parsedJSON = $player.getMFJson();
            var hash = parsedJSON.hash;
            var page_url = window.location.toString().parseURL();

            if (!$.isEmptyObject(hash)) {
                for (var key in hash) {
                    page_url.hash[key] = hash[key][0].value;
                }
            } else {
                page_url.hash = {};
            }
            highlightMFSub(hash.t[0].value);


            delete page_url.search.t;
            delete page_url.search.xywh;

            history.pushState(null, null, page_url.toString());
        }
    }

    function calcSec(hms) {
        var time = (hms.split(":"));
        var hh = parseInt(time[0]);
        var mm = parseInt(time[1]);
        var ss = parseInt(time[2]);

        return ((mm * 60) + (hh * 3600) + ss);
    }

    function highlightMFSub(t) {
        var sMF, eMF, sMFtest, eMFtest;

        t = t.replace('npt:', '');

        if (t.indexOf(",") != -1) {
            var mfTime = (t.split(","));
            sMFtest = mfTime[0];
            sMFtest = sMFtest.length > 0 ? sMFtest : '0';
            eMFtest = mfTime[1];
        } else {
            sMFtest = t;
            eMFtest = '86400';
        }

        sMF = sMFtest.indexOf(":") == -1 ? sMFtest : calcSec(sMFtest);
        eMF = eMFtest.indexOf(":") == -1 ? eMFtest : calcSec(eMFtest);
        sMF = parseFloat(sMF);
        eMF = parseFloat(eMF);

        $('.sub-text p').removeClass("selected-frag").each(function () {
//                var sSub = $(this).data('startss');
            var eSub = parseFloat($(this).data('endss'));

//                console.log(sMF + '<' + eSub + ' && ' + eMF + '>=' + eSub);
            if (sMF < eSub && eMF >= eSub) {
                $(this).addClass("selected-frag");
            }
        });
        var $firstSelFrag = $(".selected-frag:first");
        if ($firstSelFrag.length > 0) {
            var $subText = $('.sub-text');
            var scrollPos = $firstSelFrag.position().top + $subText.scrollTop();

            $subText.animate({
                scrollTop: scrollPos
            });
        } else {
            console.warn("No subtitles in this fragment. Are you sure that fragment is inside video duration?")
        }
    }

    $(window).off('popstate').on('popstate.changemf', function () {
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

        if (frag) {
            console.info("popstate! new fragment: " + frag);

            $player.setmf(frag);

            if (hasVideoSub) {
                highlightMFSub(t);
            }
        }

        var extractor = page_url.search.enriched;
        if (extractor) {
            console.info("popstate! new extractor: " + extractor);
            $('.nerdSelect select').val(extractor).change();
            var ents = getFromLocalStorage(videokey + extractor);
            if (ents) {
                onEntitiesToShow(ents);
            } else {
                $('form.nerdify').submit();
            }
        }
    });

    $('.video-list .video-link').each(function () {
        var $li = $(this);
        var video_uuid = $li.data('uuid');

        if (typeof video_uuid != 'undefined' && video_uuid != "") {
            retrieveInfo(video_uuid, function (metadata) {
                if (metadata.error) {
                    console.error(metadata.error);
                    return;
                }

                if (!metadata.title) {
                    metadata.title = "Video";
                }
                if (!metadata.thumb) {
                    metadata.thumb = "../img/thumb-default.png";
                }

                $('h4 a', $li).text(metadata.title).attr('alt', metadata.title);
                var $thumb = $('<img>').attr('src', metadata.thumb).addClass('thumb');
                $('.thumb-cont', $li).attr('title', metadata.title).append($thumb);

                $('.loader', $li).hide();
                $('.content', $li).show(function () {
                    $(this).addClass('visible');
                });
            });
        }
    });

    function retrieveInfo(uuid, callback) {
        $.getJSON('/metadata/' + uuid, callback);
    }

});

jQuery.fn.extend({
    addLoader: function (direction) {
        if (!jQuery.loaderImg) {
            jQuery.loaderImg = $("<img>").attr('src', '/img/ajax-loader.gif');
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
    console.log(URL);
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(URL);
    return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

function getFromLocalStorage(key) {
    try {
        var data = JSON.parse(localStorage[key]);
        return data.value;
    } catch (e) {
        return null;
    }
}

function saveInLocalStorage(key, value) {
    try {
        localStorage[key] = JSON.stringify({timestamp: Date.now(), value: value});
    } catch (e) {
        console.log(e);
        if (e == DOMException.QUOTA_EXCEEDED_ERR) {
            console.warn('Quota exceeded! Delete all and write');
            localStorage.clear();
            saveInLocalStorage(key, value);
        }
    }
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
            s = s.split('=');
            if (s.length > 2) {
                s[1] += '';
                for (var i = 2; i < s.length; i++) {
                    s[1] += '=' + s[i];
                }
            }
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

function displayEntitiesSub(entJson) {
    var $newSubCont = $plainSubCont.clone();
    var $subList = $newSubCont.find('p');
    var subIndex;
    var entityList = entJson;


    //sorting JSON for end character desc and by length
    entityList.sort(
        /**
         * @return {number}
         */
            function SortByEndTime(x, y) {
            if (x.endNPT == y.endNPT) {
                return ((x.label.length == y.label.length) ? 0 : (x.label.length < y.label.length) ? 1 : -1)
            } else if (parseFloat(x.endNPT) > parseFloat(y.endNPT)) return -1;
            else return 1;
        });

    subIndex = $subList.length - 1;
    entityList.forEach(function (entity) {

        while (subIndex >= 0) {
            var $thisSub = $subList.get(subIndex);

            if (!$thisSub.id || $thisSub.id == '') {
                subIndex--;
            } else {
                var entStart = parseFloat(entity.startNPT);
                var entEnd = parseFloat(entity.endNPT);
                $thisSub = $($thisSub);
                if (entStart >= $thisSub.data('startss') && entEnd <= $thisSub.data('endss')) {

                    var text = $thisSub.text();
                    var nerdTypeSplit = entity.nerdType.split('#');
                    var nerdType = nerdTypeSplit.length > 1 ? nerdTypeSplit[1].toLowerCase() : "thing";

                    var str = '<span class="entity ' + nerdType + '">' + entity.label + '</span>';


                    $thisSub.html(text.replace(entity.label, str));
                    break;
                } else {
                    subIndex--;
                }
            }
        }

    });

    $('.sub-text', document).replaceWith($newSubCont);
}
function showEntityList(entityList) {
    $(".template-list-rows").empty();
    $("#entity-sect").fadeIn();

    entityList.sort(
        function SortByNerdType(x, y) {
            return ((x.nerdType == y.nerdType) ? 0 : ((x.nerdType > y.nerdType) ? 1 : -1 ));
        });

    var typeList = entityList.reduce(function (memo, ent) {

        if (!memo[ent.nerdType]) {
            memo[ent.nerdType] = [];
        }
        memo[ent.nerdType].push(ent);
        return memo;
    }, {});

    $('.totEnt').html(entityList.length);
    $('.extEnt').html(entityList[0].extractor.toUpperCase());


    var count = 0;

    for (var type in typeList) {
        ++count;
        var typeName = type.split('#')[1];
        var entTypeList = typeList[type];


        var $row = $("<div>").loadTemplate($("#templateType"), {
            typeAndOccurrences: entTypeList.length + " " + typeName
        }).appendTo(".template-list-rows");
        entTypeList.forEach(function (ent) {

            var href = ent.uri ? ent.uri : '';

            var $e = $("<li>").loadTemplate($("#templateEnt"), {
                entA: '#' + ent.label
            });

            $(".displayEntity", $row).append($e);


            $('.entity.list', $e).addClass((typeName.toLowerCase()));
            $('span>a', $e).attr("href", href);
            $('span>a', $e).attr("target", "_blank");

        });
    }
}
function onEntitiesToShow(entJson) {
    displayEntitiesSub(entJson);
    showEntityList(entJson);
}

(function (Popcorn) {

    Popcorn.plugin("highlightSub", function (options) {

        return {
            _setup: function (options) {
                options.$sub = $('#' + options.subId);
            },
            start: function (event, options) {
                options.$sub.addClass('now-playing');
            },
            end: function (event, options) {
                options.$sub.removeClass('now-playing');
            }
        };
    });

})(Popcorn);
