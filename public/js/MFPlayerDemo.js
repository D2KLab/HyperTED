var uri = video.uri.replace(new RegExp('&amp;', 'g'), '&') + window.location.hash;
var storageKey = 'fragmentenricher.';
var videokey = storageKey + video.vendor + '-' + video.id + '.';

$(document).ready(function () {
    var $subCont = $('#sub-cont');
    var hasVideoSub = $subCont.exists();
    var parsedJSON;

    var mfuri = uri; //Media Fragment URI
    //init smfplayer
    var $player = $("#video").smfplayer({
        mfURI: mfuri,
        spatialOverlay: true,
        temporalHighlight: true,
        autoStart: false  //TODO remove
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

            $entSect = $entSect || localStorage[videokey + 'ent-sect'];
            $nerdified = $nerdified || localStorage[videokey + 'nerd'];
            $plain = $plain || localStorage[videokey + 'plain'];

            if ($nerdified && $plain && $entSect) {
                $submitButton.prop('disabled', false).removeLoader();
                history.pushState(null, null, page_url.toString());
                synchEnrichment();
                return false;
            }

            $(this).ajaxSubmit({
                success: function (data) {
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
                    $('#playlist-sect').append($entSect);

                    try {
                        localStorage[videokey + 'ent-sect'] = $entSect[0].outerHTML;
                        localStorage[videokey + 'nerd'] = $nerdified[0].outerHTML;
                        localStorage[videokey + 'plain'] = $plain[0].outerHTML;
                    } catch (e) {
                        console.log(e);
                        if (e == DOMException.QUOTA_EXCEEDED_ERR) {
                            console.warn('Quota exceeded! Delete all and write');
                            localStorage.clear();
                            localStorage[videokey + 'ent-sect'] = $entSect[0].outerHTML;
                            localStorage[videokey + 'nerd'] = $nerdified[0].outerHTML;
                            localStorage[videokey + 'plain'] = $plain[0].outerHTML;
                        }
                    }

                    $submitButton.prop('disabled', false).removeLoader();
                    history.pushState(null, null, page_url.toString());
                    synchEnrichment();
                },
                error: function () {
                    console.error('Something went wrong');
                }
            });
        });

        $(window).off('popstate.nerdify').on('popstate.nerdify', function () {
            synchEnrichment();
        });

        function synchEnrichment() {
            var isEnriched = getParameterByName('enriched');
            $entSect = $entSect || localStorage[videokey + 'ent-sect'];
            $nerdified = $nerdified || localStorage[videokey + 'nerd'];
            $plain = $plain || localStorage[videokey + 'plain'];

            if (isEnriched) {
                if ($entSect && $nerdified) {
                    $nerdified = $($nerdified);
                    $plain = $($plain);
                    $entSect = $($entSect);

                    $entSect.appendTo('#playlist-sect').fadeIn();
                    $nerdifyForm.fadeOut();
                    $plain.filter('body *').replaceWith($nerdified);
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

    $(".nesting").on({
        mouseenter: function () {
            $(this).find('span').attr('id', 'nestEntity');
        }, mouseleave: function () {
            $(this).find('span').removeAttr('id');
        }
    });

    $(document).on('click', '.sub-text p[data-time]', function () {
        var srtTime = $(this).data('time');
        var hms = srtTime.replace(/,/g, '.').replace(' --> ', ',');
        $player.setmf('t=' + hms).playmf();
        updateMFurl();
    });


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
            retrieveInfo(video_uuid, function (video_info) {
                if (video_info.error) {
                    console.error(video_info.error);
                    return;
                }
                $('h4 a', $li).text(video_info.title).attr('alt', video_info.title);
                var $thumb = $('<img>').attr('src', video_info.thumb).addClass('thumb');
                $('.thumb-cont', $li).attr('title', video_info.title).append($thumb);

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