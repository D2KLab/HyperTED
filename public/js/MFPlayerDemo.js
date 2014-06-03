var uri = video.uri.replace(new RegExp('&amp;', 'g'), '&') + window.location.hash;
var storageKey = 'fragmentenricher.';
var videokey = storageKey + video.uuid + '.';
$(document).ready(function () {
    var $navbar = $('.navbar').not('.navbar-placeholder');
    var navHeight = $navbar.height();
    $(window).scroll(function () {
        $navbar.toggleClass('compact', $(window).scrollTop() > navHeight);
    });


    var $subCont = $('#sub-cont');
    var hasVideoSub = $subCont.exists();
    var parsedJSON;

    var mfuri = uri; //Media Fragment URI
    //init smfplayer
    var $playerSect = $('#player-sect');
    var $player = $("#video").smfplayer({
        mfURI: mfuri,
        spatialOverlay: true,
        temporalHighlight: true,
        width: 640,
        height: 360,
        alwaysShowControls: true,
        preload: 'metadata',
        features: ['playpause', 'current', 'progress', 'duration', 'volume'],
        autoStart: false,  //TODO remove
        success: function (media, domObj) {
            $(this).trigger('ready');
            $(media).one('loadedmetadata', function () {
                displayChapters();
            }).on('play', function () {
                $('.info-on-player', $playerSect).hide();
            }).on('pause', function () {
                $('.info-on-player', $playerSect).show();
            });
        }
    });
    video.player = $player;


    $('.see-all').click(function () {
        var $this = $(this);
        var $target = $('#' + $this.attr('for'));
        $target.toggleClass('full');
        var text = $target.hasClass('full') ? 'see less' : 'see more';
        $this.text(text)
    });

    if (Modernizr.history && Modernizr.localstorage) {
        var $nerdifyForm = $('form.nerdify');
        var ajaxAction = $nerdifyForm.data('action');
        var $nerdified = $('.enriched').exists() ? $('.enriched') : undefined;
        var $plain = $nerdified ? undefined : (hasVideoSub ? $('.sub-text') : $('#descr'));
        var $entSect = $('#entity-sect').exists() ? $('#entity-sect') : undefined;

        $nerdifyForm.attr('action', ajaxAction).submit(function (e) {
            e.preventDefault();
            var $submitButton = $('button[type="submit"]', $nerdifyForm);
            $submitButton.prop('disabled', true).addLoader('left');

            var page_url = window.location.toString().parseURL();
            page_url.search.enriched = true;

            $entSect = $entSect || getEnrichmentFromLocalStorage(videokey + 'ent-sect');
            $nerdified = $nerdified || getEnrichmentFromLocalStorage(videokey + 'nerd');
            $plain = $plain || getEnrichmentFromLocalStorage(videokey + 'plain');

            if ($nerdified && $plain && $entSect) {
                $submitButton.prop('disabled', false).removeLoader();
                history.pushState(null, null, page_url.toString());
                synchEnrichment();
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
                        //DO NOTHING
                    }

                    var $data = $(data);
                    if (hasVideoSub) {
                        $nerdified = $data.find('.sub-text');
                        $plain = $('.sub-text', $subCont);
                    } else {
                        $nerdified = $data.find('.descr');
                        $plain = $('#descr');
                        if ($plain.hasClass('full')) {
                            $nerdified.addClass('full');
                        }
                    }

                    $entSect = $data.find('#entity-sect').hide();
                    $('#ent_append').append($entSect);

                    try {
                        saveEnrichmentInLocalStorage(videokey + 'ent-sect', $entSect[0].outerHTML);
                        saveEnrichmentInLocalStorage(videokey + 'nerd', $nerdified[0].outerHTML);
                        saveEnrichmentInLocalStorage(videokey + 'plain', $plain[0].outerHTML);
                    } catch (e) {
                        console.log(e);
                        if (e == DOMException.QUOTA_EXCEEDED_ERR) {
                            console.warn('Quota exceeded! Delete all and write');
                            localStorage.clear();
                            saveEnrichmentInLocalStorage(videokey + 'ent-sect', $entSect[0].outerHTML);
                            saveEnrichmentInLocalStorage(videokey + 'nerd', $nerdified[0].outerHTML);
                            saveEnrichmentInLocalStorage(videokey + 'plain', $plain[0].outerHTML);
                        }
                    }

                    $submitButton.prop('disabled', false).removeLoader();
                    history.pushState(null, null, page_url.toString());
                    synchEnrichment();
                },
                error: function () {
                    var alert = $('<div class="alert alert-danger fade in">').text('Something went wrong. Try again later');
                    alert.appendTo($nerdifyForm).alert();
                    $submitButton.removeLoader();
                    console.error('Something went wrong');
                }
            });
        });

        $(window).off('popstate.nerdify').on('popstate.nerdify', function () {
            synchEnrichment();
        });

        function synchEnrichment() {
            var isEnriched = getParameterByName('enriched');
            $entSect = $entSect || getEnrichmentFromLocalStorage(videokey + 'ent-sect');
            $nerdified = $nerdified || getEnrichmentFromLocalStorage(videokey + 'nerd');
            $plain = $plain || getEnrichmentFromLocalStorage(videokey + 'plain');

            if (isEnriched) {
                if ($entSect && $nerdified) {
                    $nerdified = $($nerdified);
                    $plain = $($plain);
                    $entSect = $($entSect);

                    $entSect.appendTo('#ent_append').fadeIn();
                    $nerdifyForm.fadeOut();
                    $plain.filter('body *').replaceWith($nerdified);
                    $('p > span.entity').has('span').addClass('nesting');
                } else {
                    // submit form
                    $nerdifyForm.submit();
                }
            } else {
                if (!$plain) {
                    //refresh page for taking info from server
                    location.reload();
                } else {
                    $nerdified = $($nerdified);
                    $plain = $($plain);
                    $entSect = $($entSect);

                    $entSect.fadeOut();
                    $nerdifyForm.fadeIn();
                    $nerdified.filter('body *').replaceWith($plain);
                }
            }
        }
    }


    $(document).on('click', '.entity', function () {
        var $entity = $(this).children('a');
        var startEntity = $entity.data('start-time');
        var endEntity = $entity.data('end-time');
        $player.setmf('t=' + startEntity + ',' + endEntity).playmf();
        updateMFurl();
    });

    $('p > span.entity').has('span').addClass('nesting');


    $(document).on('click', '.sub-text p[data-time]', function () {
        var srtTime = $(this).data('time');
        var hms = srtTime.replace(/,/g, '.').replace(' --> ', ',');
        $player.setmf('t=' + hms).playmf();
        updateMFurl();
    });


//////CHAPTERS
    function displayChapters() {
        var oldChapStart = 0;
        var oldChapEnd = 0;
        $('.chap-link').each(function () {

            var $chapter = $(this).children('a');
            var startChapter = $chapter.data('start-time');
            var endChapter = $chapter.data('end-time');

            var totWidth = $player.getDuration() / 1000;
            var width = ((endChapter - startChapter) / totWidth) * 100;
            $(this).css("width", width + "%");


            oldChapStart = startChapter;

            if (oldChapEnd < startChapter) {
                var spaceWidth = ((startChapter - oldChapEnd) / totWidth) * 100;
                $(this).css("margin-left", spaceWidth + "%");
            }
            oldChapEnd = endChapter;

            var $totChapters = $('.chap-link').length;
            var index = $('.chap-line .chap-link').index(this);
            $(this).hover(function () {
                    if ($(this).width() < 175) {
                        var opt = {
                            bottom: "30px",
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
                    $chapter.children('.chap-timing').css("bottom", "0");
                });


            $(this).on('click', function () {
                $player.setmf('t=' + startChapter + ',' + endChapter).playmf();

                $('.chap-link').removeClass('selected-chap');
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

            delete page_url.search.t;
            delete page_url.search.xywh;

            history.pushState(null, null, page_url.toString());
        }
    }


    $(window).off('popstate.changemf').on('popstate.changemf', function () {
        console.info("popstate.changemf");
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
            $player.setmf(frag);
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
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(URL);
    return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

function getEnrichmentFromLocalStorage(key) {
    try {
        var data = JSON.parse(localStorage[key]);
    } catch (e) {
        return null;
    }
    if (!data.timestamp || Date.now() - data.timestamp > 86400000) {
        return null;
    } else return data.value;
}

function saveEnrichmentInLocalStorage(key, value) {
    localStorage[key] = JSON.stringify({timestamp: Date.now(), value: value});
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

