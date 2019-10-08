const videoUri = video.uri.replace(new RegExp('&amp;', 'g'), '&') + window.location.hash;
const storageKey = 'fragmentenricher.';
const videokey = `${storageKey + video.uuid}.`;
let parsedJSON;
let $plainSubCont; // Container for subs with no entities

$(document).ready(() => {
  // resize navbar on scroll
  const $navbar = $('.navbar').not('.navbar-placeholder');
  const navHeight = $navbar.height();
  $(window).scroll(() => {
    $navbar.toggleClass('compact', $(window).scrollTop() > navHeight);
  });

  const $subCont = $('#sub-cont');
  const hasVideoSub = $subCont.exists();

  // init smfplayer
  const $playerSect = $('#player-sect');
  var $player = $('#video').smfplayer({
    mfURI: videoUri,
    spatialOverlay: true,
    temporalHighlight: true,
    width: 640,
    height: 360,
    alwaysShowControls: true,
    preload: 'metadata',
    features: ['playpause', 'current', 'progress', 'duration', 'volume'],
    autoStart: false, // TODO remove
    success(media, domObj) {
      showTEDSuggestedChaps();

      $(media).one('loadedmetadata', () => {
        displayChapters();
        displayPins();
        if ($player.getMFJson().hash.t != '' && $player.getMFJson().hash.t != 'NULL' && $player.getMFJson().hash.t != undefined) {
          highlightMFSub($player.getMFJson().hash.t[0].value, () => {
            const $selFrag = $('.selected-frag');
            if ($selFrag.exists() && $selFrag.hasClass('chap-title')) {
              const chapId = $selFrag.parent().data('chapter');
              selectChap(chapId);
            }
            showTEDSuggestedChaps();
          });
        } else showTEDSuggestedChaps();

        const $pop = Popcorn(media);
        $('.sub-text p[data-time]').each(function () {
          const $this = $(this);
          const thisId = $this.attr('id');
          if (!thisId || !thisId.length) {
            return;
          }
          $pop.highlightSub({
            start: Math.round($this.data('startss')),
            end: Math.round($this.data('endss')),
            subId: thisId,
          });
        });
      }).on('play', () => {
        $('.info-on-player', $playerSect).hide();
      }).on('pause', () => {
        $('.info-on-player', $playerSect).show();
      });
    },
  });
  video.player = $player;
  console.debug($player);


  // play/pause clicking on the video
  let isPlaying = false;
  $('.mejs-inner').on('click', () => {
    if (isPlaying) {
      $player.pause();
      isPlaying = false;
    } else {
      $player.play();
      isPlaying = true;
    }
  });

  if (Modernizr.history && Modernizr.localstorage) {
    // Nerdify form become an ajax form
    const $nerdifyForm = $('form.nerdify');
    const ajaxAction = $nerdifyForm.data('action');

    $nerdifyForm.attr('action', ajaxAction).submit(function (e) {
      e.preventDefault();
      const $submitButton = $('button[type="submit"]', $nerdifyForm);
      $submitButton.width($submitButton.width()).prop('disabled', true).html('<img src="/HyperTED/img/ajax-loader-greyRed.gif"><img src="/HyperTED/img/ajax-loader-greyRed.gif"><img src="/HyperTED/img/ajax-loader-greyRed.gif">');

      const extractor = $('.nerdSelect select', $nerdifyForm).val();
      const page_url = window.location.toString().parseURL();
      page_url.search.enriched = extractor;

      // if entities are in LocalStorage, get them and go on
      const entitiesLS = getFromLocalStorage(videokey + extractor);
      if (entitiesLS) {
        $submitButton.prop('disabled', false).html('Nerdify');
        history.pushState(null, null, page_url.toString());
        onEntitiesToShow(entitiesLS);
        showTEDSuggestedChaps();
        return false;
      }

      $(this).ajaxSubmit({
        success(data) {
          try {
            if (data.error) {
              const alert = $('<div class="alert alert-danger fade in">').text('Something went wrong. Try again later');
              alert.appendTo($nerdifyForm).alert();
              $submitButton.prop('disabled', false).html('Nerdify');
              console.error(data.error);
              return;
            }
          } catch (e) {
            console.error(e);
            // DO NOTHING
          }

          saveInLocalStorage(videokey + extractor, data);

          $submitButton.prop('disabled', false).html('Nerdify');
          history.pushState(null, null, page_url.toString());
          onEntitiesToShow(data);
          showTEDSuggestedChaps();
        },
        error() {
          const alert = $('<div class="alert alert-danger fade in">').text('Something went wrong. Try again later');
          alert.appendTo($nerdifyForm).alert();
          $submitButton.removeLoader();
          console.error('Something went wrong');
        },
      });
    });
  }

  $('#recommend').on('click', function () {
    $(this).hide();
    $('.see-also').show();
    $('#suggested-courses').show();
  });

  const $suggestedVideoList = $('#suggestedVideoList');
  const $playlistSect = $('.see-also #playlist-sect');

  function showTEDSuggestedChaps() {
    if (!$player) return;
    const extractor = window.location.toString().parseURL().search.enriched;
    $('.invite', $playlistSect).toggle(!extractor);
    $('.no_ent', $playlistSect).hide();

    if (extractor) {
      $('.loading', $playlistSect).show();
      const timeFrag = $player.getMFJson().hash.t;

      $.ajax({
        url: `/HyperTED/suggestmf/${video.uuid}`,
        data: {
          extractor,
          startMF: (timeFrag && timeFrag[0].startNormalized) || 0,
          endMF: (timeFrag && timeFrag[0].endNormalized) || null,
        },
      }).done((res) => {
        $('.loading', $playlistSect).hide();
        $suggestedVideoList.empty();
        $('.no_ent', $playlistSect).toggle(!Object.keys(res).length);

        for (const v in res) {
          if (!res.hasOwnProperty(v)) continue;
          const suggVideo = res[v];
          const meta = suggVideo.metadata;
          var title; var
            thumb;
          if (suggVideo.metadata && suggVideo.metadata != 'undefined') {
            title = meta.title;
            thumb = meta.thumb;
          } else {
            title = 'Video';
            thumb = '../HyperTED/img/thumb-default.png';
          }
          $suggestedVideoList.loadTemplate($('#suggTedChap'),
            {
              uuid: v,
              href: `video/${v}`,
              title,
              thumb,
            },
            { append: true });

          const thisVid = $(`.video-link[data-uuid=${v}]`, $suggestedVideoList);
          const frags = suggVideo.chaps;
          for (const f in frags) {
            if (!frags.hasOwnProperty(f)) continue;
            $('.frag-list', thisVid).loadTemplate($('#fragLi'),
              {
                href: `video/${v}#t=${frags[f].startNPT},${frags[f].endNPT}`,
                content: `Chapter ${frags[f].chapNum} (${labelTime(frags[f].startNPT)} - ${labelTime(frags[f].endNPT)})`,
              },
              { append: true });
          }
        }
        let raccFor = 'the entire video';
        const tFrag = $player.getMFJson().hash.t;
        if (tFrag) {
          raccFor = $('.selected-chap-num').text();
          raccFor = raccFor.trim().length ? `chapter ${raccFor}` : `t=${tFrag[0].start},${tFrag[0].end}`;
        }
        $suggestedVideoList.prepend($(`<h4>Raccomandation for ${raccFor}</h4>`));
      }).fail(() => {
        $('.loading', $playlistSect).hide();
        $('.see-also').html('<p>Something went wrong, please try later</p>');
      });
    } else {
      $('.loading', $playlistSect).hide();
    }
  }


  // ask for hotspots
  $('#hotspot-form').submit(function (e) {
    e.preventDefault();
    const errText = 'We can not generate hotspots for this video. This functionality is only available for TED Talks';
    const $form = $(this);
    const $button = $('button', $form);
    $button.width($button.width()).prop('disabled', true).html('<img src="/HyperTED/img/ajax-loader-white.gif"><img src="/HyperTED/img/ajax-loader-white.gif"><img src="/HyperTED/img/ajax-loader-white.gif">');
    $(this).ajaxSubmit({
      success(data) {
        let text;
        try {
          if (data.error) {
            text = errText;
            $button.text().css('width', 'auto');
            console.error(data.error);
            return;
          }
          //                    text = 'The request was sent successfully. Came back later to see hotspots.'
          //                    location.reload(true);
          $('#hotspots-cont .hscont-inner').html($(data).find('.hscont-inner'));
          $form.hide();
          displayPins();
          if (Modernizr.history) {
            const page_url = window.location.toString().parseURL();
            page_url.search.hotspotted = true;

            history.pushState(null, null, page_url.toString());
          }
        } catch (e) {
          text = errText;
          console.error(text);
          console.log(e);
        }
        const $p = $('<p>').text(text);
        $button.children().fadeOut();
        $button.append($p).width($p.width());
        setTimeout(() => {
          $button.append($p);
          $p.css('opacity', 1);
        }, 600);
      },
      error() {
        const text = errText;

        const $p = $('<p>').text(text);
        $button.children().fadeOut();
        $button.append($p).width($p.width());
        $p.css('opacity', 1);

        console.error(data.error);
      },
    });
  });

  $plainSubCont = $('.sub-text');
  if (video.entitiesL) {
    onEntitiesToShow(video.entitiesL);
  }

  // managing of click on a sub
  // 1: in a chapter
  $(document).on({
    click(e) {
      e.preventDefault();
      const chapId = $(this).data('chapter');
      $(`#ch${chapId}`).click();
    },
  }, '.sub-text p[data-chapter]');

  // 2: not in a chapter
  $(document).on('click', '.sub-text p[data-time]:not([data-chapter])', function () {
    const srtTime = $(this).data('time');
    const hms = srtTime.replace(/,/g, '.').replace(' --> ', ',');
    $player.setmf(`t=${hms}`).playmf();
    $('.chap-link').removeClass('selected-chap');
    updateMFurl();
  });

  function calcDivWidth(startTime, endTime) {
    const totWidth = ($player.getDuration() / 1000);
    return ((endTime - startTime) / totWidth) * 100;
  }

  function calcSpaceWidth(startTime, oldEndTime) {
    const totWidth = ($player.getDuration() / 1000);
    return ((startTime - oldEndTime) / totWidth) * 100;
  }

  function displayPins() {
    const $pin = $('.pin');
    $pin.each(function () {
      const $this = $(this);

      $this.qtip({
        content: {
          text: $('.qtipEnt', $this).html(),
          title: $('.qtipTitle', $this).html(),
        },
        style: {
          classes: 'qtip-light qtip-rounded',
          padding: '15px',
          tip: 'bottom middle',
        },
        position: {
          my: 'bottom center',
          at: 'top center',
        },
        hide: {
          fixed: true,
          delay: 300,
        },
      });
    });

    $pin.fadeIn();

    let oldEnd = 0;


    $pin.each(function () {
      const $hotSpot = $(this).children('a');
      const startHS = $hotSpot.data('start-time');
      const endHS = $hotSpot.data('end-time');

      const width = calcDivWidth(startHS, endHS);
      $(this).css('width', `${width}%`);

      if (oldEnd < startHS) {
        const spaceWidth = calcSpaceWidth(startHS, oldEnd);
        $(this).css('margin-left', `${spaceWidth}%`);
      }
      oldEnd = endHS;


      $(this).on('click', () => {
        $player.setmf(`t=${startHS},${endHS}`).playmf();
        updateMFurl();
      });
      if ($('.pinEnt', $(this)).width >= $(this).width) $('.pinEnt', $(this)).css('max-width', $(this).width - 15);
    });


    const $suggCourses = $('#suggested-courses');
    if ($('.chap-link').length) $suggCourses.loadTemplate($('#courseList'), {});

    if ($pin.length) {
      $('.invite', $suggCourses).hide();
      $('.loading', $suggCourses).show();

      $.ajax({
        url: '/HyperTED/courses',
        data: {
          uuid: video.uuid,
        },
      }).done((data) => {
        $('.loading', $suggCourses).hide();
        const $coursesList = $('#courses-list');
        if (!data.length) return;
        for (const i in data) {
          if (!data.hasOwnProperty(i)) continue;
          const course = data[i];
          $coursesList.loadTemplate($('#course'), {
            url: course.locator.value,
            title: course.title.value,
            thumb: `\\HyperTED\\img\\logos\\${course.source}.png`,
          }, { append: true });

          if (i >= 2) break;
        }
        $coursesList.on('click', 'a', function (e) {
          e.preventDefault();
          openPopup($(this).attr('href'));
        });
      }).fail(() => {
        $('.loading', $suggCourses).hide();
      });
    } else {
      $('.invite', $suggCourses).show();
      $('.loading', $suggCourses).hide();
    }
  }


  $('#video-info-chapters').fadeIn();
  const $chapLinks = $('.chap-link');
  if (!$chapLinks.first().data('duration')) {
    const $totChapters = $chapLinks.length;
    $chapLinks.each(function () {
      $(this).css('width', `${100 / $totChapters}%`);
    });
  }

  function displayChapters() {
    $('#video-info-chapters').fadeIn();
    const $chapLinks = $('.chap-link');
    const $totChapters = $chapLinks.length;

    $chapLinks.each(function () {
      const $chapNum = $(this).find('.chap-num');
      const index = $('.chap-line .chap-link').index(this);

      const $chapter = $(this).children('a');
      const startChapter = $chapter.data('start-time');
      const endChapter = $chapter.data('end-time');

      if (!$('.chap-link').data('duration')) {
        let chapWidth;
        if (index === $totChapters - 1) {
          chapWidth = calcDivWidth(startChapter, ($player.getDuration() / 1000));
        } else chapWidth = calcDivWidth(startChapter, endChapter);

        $(this).css('width', `${chapWidth}%`);
      }

      $(this).hover(function () {
        if ($(this).width() < 175) {
          const opt = {
            top: '16px',
            opacity: '1',
            cursor: 'auto',
          };

          if (index > Math.floor($totChapters / 2)) {
            opt.right = 0;
          }
          $chapter.children('.chap-timing').css(opt);
        }
      });

      $(this).on('click', () => {
        $player.setmf(`t=${startChapter},${endChapter}`).playmf();
        const chapNum = $chapNum[0].innerText;

        selectChap(chapNum);
        updateMFurl();
      });
    });

    setTimeout(() => {
      $('.chap-link').each(function () {
        const $chapNum = $(this).find('.chap-num');
        if ($(this).width() >= 25) {
          $chapNum.fadeIn();
          $chapNum.css('display', 'inline-block');
        }
      });
    }, 500);
  }

  function selectChap(chapNum) {
    const chapNumLast = $('.chap-num:last')[0].innerText;
    $('.chap-link').removeClass('selected-chap');

    $(this).addClass('selected-chap');
    const isOpening = (chapNum == '0');
    if (!isOpening) {
      $('.first-part').text('chapter   ');
      $('.selected-chap-num').text(chapNum);
      $('.last-part').text(`   of   ${chapNumLast}`);
    }
    $('.hide-on-intro').toggle(!isOpening);
    $('.intro').toggle(isOpening);
  }
  function updateMFurl() {
    if (Modernizr.history) {
      parsedJSON = $player.getMFJson();
      const { hash } = parsedJSON;
      const page_url = window.location.toString().parseURL();

      if (!$.isEmptyObject(hash)) {
        for (const key in hash) {
          if (!hash.hasOwnProperty(key)) continue;
          page_url.hash[key] = hash[key][0].value;
        }
      } else {
        page_url.hash = {};
      }
      highlightMFSub(hash.t[0].value);
      showTEDSuggestedChaps();
      delete page_url.search.t;
      delete page_url.search.xywh;

      history.pushState(null, null, page_url.toString());
    }
  }

  function timeToSec(hms) {
    const time = (hms.split(':'));
    const hh = parseInt(time[0]);
    const mm = parseInt(time[1]);
    const ss = parseInt(time[2]);

    return ((mm * 60) + (hh * 3600) + ss);
  }

  function highlightMFSub(t, callback) {
    let sMF; let eMF; let sMFtest; let
      eMFtest;

    t = t.replace('npt:', '');

    if (t.indexOf(',') != -1) {
      const mfTime = (t.split(','));
      sMFtest = mfTime[0];
      sMFtest = sMFtest.length > 0 ? sMFtest : '0';
      eMFtest = mfTime[1];
    } else {
      sMFtest = t;
      eMFtest = '86400';
    }

    sMF = sMFtest.indexOf(':') == -1 ? sMFtest : timeToSec(sMFtest);
    eMF = eMFtest.indexOf(':') == -1 ? eMFtest : timeToSec(eMFtest);
    sMF = parseFloat(sMF);
    eMF = parseFloat(eMF);

    $('.sub-text p').removeClass('selected-frag').each(function () {
      const eSub = parseFloat($(this).data('endss'));

      if (sMF < eSub && eMF >= eSub) {
        $(this).addClass('selected-frag');
        $(this).siblings('.chap-title').addClass('selected-frag');
      }
    });
    const $firstSelFrag = $('.selected-frag:first');
    if ($firstSelFrag.length > 0) {
      const $subText = $('.sub-text');
      const scrollPos = $firstSelFrag.position().top + $subText.scrollTop();

      $subText.animate({
        scrollTop: scrollPos,
      });
    } else {
      console.warn('No subtitles in this fragment. Are you sure that the fragment is inside video duration?');
    }
    if (callback) callback();
  }


  // Browser back and forward
  $(window).off('popstate').on('popstate', () => {
    const page_url = window.location.toString().parseURL();

    // media fragment
    let frag;
    const t = page_url.search.t || page_url.hash.t;
    if (t) frag = `t=${t}`;

    const xywh = page_url.search.xywh || page_url.hash.xywh;
    if (xywh) frag = frag ? `${frag}&` + `xywh=${xywh}` : `xywh=${xywh}`;

    if (frag) {
      console.info(`popstate! new fragment: ${frag}`);

      $player.setmf(frag);
      if (hasVideoSub) {
        highlightMFSub(t);
      }
    }

    // hotspotted
    const { hotspotted } = page_url.search;
    if (hotspotted) {
      $('#hotspot-form').submit();
    } else {
      $('.hscont-inner').hide();
      $('.btn-hotspot').text('GENERATE HOTSPOTS').removeAttr('style').prop('disabled', false);
      $('#hotspot-form').show();
    }

    // nerdification
    const extractor = page_url.search.enriched;
    if (extractor) {
      console.info(`popstate! new extractor: ${extractor}`);
      $('.nerdSelect select').val(extractor).change();
      const ents = getFromLocalStorage(videokey + extractor);
      if (ents) {
        onEntitiesToShow(ents);
      } else {
        $('form.nerdify').submit();
      }
    } else {
      $('#entity-sect').fadeOut();
      if ($('.sub-text').find('.entity').length > 0) {
        displayEntitiesSub([]);
      }
    }

    showTEDSuggestedChaps();
  });
});

jQuery.fn.extend({
  addLoader(direction) {
    if (!jQuery.loaderImg) {
      jQuery.loaderImg = $('<img>').attr('src', '/HyperTED/img/ajax-loader.gif');
    }

    const $loaderImg = jQuery.loaderImg;
    jQuery.loaderImg = $loaderImg.clone();
    if (direction == 'left') {
      $(this).before($loaderImg);
    } else {
      $(this).after($loaderImg);
    }
    $(this).data('loader', $loaderImg);
    return true;
  },
  removeLoader() {
    const loader = $(this).data('loader');
    $(loader).remove();
  },
  exists() {
    return $(this).length > 0;
  },
});

function getFromLocalStorage(key) {
  try {
    const dataLS = localStorage[key];
    if (!dataLS) return null;
    const data = JSON.parse(dataLS);
    return data.value;
  } catch (e) {
    console.error(e);
    return null;
  }
}

function saveInLocalStorage(key, value) {
  try {
    localStorage[key] = JSON.stringify({ timestamp: Date.now(), value });
  } catch (e) {
    console.log(e);
    if (e == DOMException.QUOTA_EXCEEDED_ERR || e.code == DOMException.QUOTA_EXCEEDED_ERR) {
      console.warn('Quota exceeded! Delete all and write');
      localStorage.clear();
      saveInLocalStorage(key, value);
    }
  }
}

String.prototype.parseURL = function () {
  if (typeof this !== 'string' && !(this instanceof String)) throw 'You can use parseURL only on strings';

  const parser = document.createElement('a');
  parser.href = `${this}`;

  let searchPart = parser.search ? parser.search.substring(1).split('&') : undefined;
  if (searchPart) {
    const searchList = {};
    searchPart.forEach((s) => {
      s = s.split('=');
      if (s.length > 2) {
        s[1] += '';
        for (let i = 2; i < s.length; i++) {
          s[1] += `=${s[i]}`;
        }
      }
      searchList[s[0]] = s[1];
    });

    searchPart = searchList;
  } else {
    searchPart = {};
  }

  let hashPart = parser.hash ? parser.hash.substring(1).split('&') : undefined;
  if (hashPart) {
    const hashList = {};
    hashPart.forEach((s) => {
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
    toString() {
      let joinSymbol;
      let search = '';
      if (Object.keys(this.search).length > 0) {
        joinSymbol = '?';
        for (const sKey in this.search) {
          if (this.search.hasOwnProperty(sKey)) {
            search += `${joinSymbol + sKey}=${this.search[sKey]}`;
            joinSymbol = '&';
          }
        }
      }
      let hash = '';
      if (Object.keys(this.hash).length > 0) {
        joinSymbol = '#';
        for (const hKey in this.hash) {
          if (this.hash.hasOwnProperty(hKey)) {
            hash += `${joinSymbol + hKey}=${this.hash[hKey]}`;
            joinSymbol = '&';
          }
        }
      }
      return `${this.protocol}//${this.host}${this.pathname}${search}${hash}`;
    },
  };
};

function displayEntitiesSub(entJson) {
  const $newSubCont = $plainSubCont.clone();
  const $subList = $newSubCont.find('p');
  const entityList = entJson;

  // sorting JSON for end character desc and by length
  entityList.sort(
    /**
     * @return {number}
     */
    (x, y) => {
      if (x.endNPT == y.endNPT) {
        return ((x.label.length == y.label.length) ? 0 : (x.label.length < y.label.length) ? 1 : -1);
      } if (parseFloat(x.endNPT) > parseFloat(y.endNPT)) return -1;
      return 1;
    },
  );
  let subIndex = $subList.length - 1;
  entityList.forEach((entity) => {
    while (subIndex >= 0) {
      let $thisSub = $subList.get(subIndex);
      if (!$thisSub.id || $thisSub.id == '') {
        subIndex--;
      } else {
        const entStart = parseFloat(entity.startNPT).toFixed(2);
        const entEnd = parseFloat(entity.endNPT).toFixed(2);
        $thisSub = $($thisSub);
        const subStart = parseFloat($thisSub.data('startss')).toFixed(2);
        const subEnd = parseFloat($thisSub.data('endss')).toFixed(2);
        if (entStart >= subStart && entEnd <= subEnd) {
          const text = $thisSub[0].innerHTML;
          const nerdTypeSplit = entity.nerdType.split('#');
          const nerdType = nerdTypeSplit.length > 1 ? nerdTypeSplit[1].toLowerCase() : 'thing';

          const str = `<span class="entity ${nerdType}">${entity.label}</span>`;

          const replace = text.replace(entity.label, str);
          $thisSub.html(replace);
          break;
        } else {
          subIndex--;
        }
      }
    }
  });

  $('.sub-text', document).replaceWith($newSubCont);
  $('p > span.entity').has('span').addClass('nesting');
}


function showEntityList(entityList) {
  $('.template-list-rows').empty();
  $('#entity-sect').fadeIn();

  entityList.sort(
    (x, y) => ((x.nerdType == y.nerdType) ? 0 : ((x.nerdType > y.nerdType) ? 1 : -1)),
  );

  const typeList = entityList.reduce((memo, ent) => {
    if (!memo[ent.nerdType]) {
      memo[ent.nerdType] = [];
    }
    memo[ent.nerdType].push(ent);
    return memo;
  }, {});

  const extr = $('select[name=enriched] option:selected').text();
  $('.totEnt').html(entityList.length);
  $('.extEnt').html(extr.toUpperCase());


  let count = 0;

  for (const type in typeList) {
    ++count;
    var typeName = type.split('#')[1];
    const entTypeList = typeList[type];

    var $row = $('<div>').loadTemplate($('#templateType'), {
      typeAndOccurrences: `${entTypeList.length} ${typeName}`,
    }).appendTo('.template-list-rows');
    entTypeList.forEach((ent) => {
      const $e = $('<li>').loadTemplate($('#templateEnt'), {
        entA: ent.label,
      });
      $('.displayEntity', $row).append($e);

      $('.entity.list', $e).addClass((typeName.toLowerCase()));
      if (ent.uri) {
        $('span>a', $e).attr('href', ent.uri).attr('target', '_blank');
      }
    });
  }
}

function onEntitiesToShow(entJson) {
  displayEntitiesSub(entJson);
  showEntityList(entJson);
}

(function (Popcorn) {
  Popcorn.plugin('highlightSub', (options) => ({
    _setup(options) {
      options.$sub = $(`#${options.subId}`);
    },
    start(event, options) {
      options.$sub.addClass('now-playing');
    },
    end(event, options) {
      options.$sub.removeClass('now-playing');
    },
  }));
}(Popcorn));


function labelTime(time) {
  let hh = Math.floor(time / 3600);
  hh = hh < 10 ? `0${hh}` : hh;
  let mm = Math.floor((time % 3600) / 60);
  mm = mm < 10 ? `0${mm}` : mm;
  let ss = Math.floor((time % 3600) % 60);
  ss = ss < 10 ? `0${ss}` : ss;

  return `${hh}:${mm}:${ss}`;
}

function openPopup(uri) {
  window.open(uri, 'titolo', 'width=800, height=600, resizable, status, scrollbars=1, location');
}
