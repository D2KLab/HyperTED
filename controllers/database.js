import UUID from 'uuid/v5';
import monk from 'monk';
import Promise from 'bluebird';
import config from '../config.json';

const db = monk(config.mongo);

const videos = db.get('videos');
videos.index('uuid', { unique: true });
videos.index('locator', { unique: true });
videos.index('vendor vendor_id', { unique: true });

const ents = db.get('entities');
ents.index('uuid');
ents.index('extractor');

const hots = db.get('hotspots');
hots.index('uuid');
hots.index('uuid startNPT', { unique: true });

const chaps = db.get('chapters');
chaps.index('uuid');
chaps.index('uuid chapNum', { unique: true });

function addChapters(uuid, chapters) {
  return Promise.mapSeries(chapters, (c) => {
    c.uuid = uuid;
    return chaps.insert(c);
  });
}

function addEntities(uuid, entities) {
  return Promise.map(entities, (e) => {
    e.uuid = uuid;

    const eParams = {
      uuid,
      extractor: e.extractor,
      startNPT: e.startNPT,
      endNPT: e.endNPT,
      uri: e.uri,
      label: e.label,
      nerdType: e.nerdType,
    };
    return ents.findOneAndUpdate(eParams, { $set: e }, { upsert: true, new: true });
  });
}


function getFilterEntities(uuid, extractor = 'textrazor', start = 0, end) {
  const timeFiltering = { $gte: parseFloat(start) };
  const ext = extractor;

  if (end) timeFiltering.$lte = parseFloat(end);

  if (ext === 'combined') return ents.find({ uuid, startNPT: timeFiltering, source: ext });
  return ents.find({ uuid, startNPT: timeFiltering, extractor: ext });
}


function getVideoFromUuid(uuid, full) {
  return videos.findOne({ uuid })
    .then((video) => {
      if (!full) return video;

      return Promise.all([
        ents.find({ uuid: video.uuid }),
        hots.find({ uuid: video.uuid }),
        chaps.find({ uuid: video.uuid }, { sort: { chapNum: 1 } }),
      ]).then((values) => {
        const [entities, hotspots, chapters] = values;
        video.entities = entities;
        video.hotspots = hotspots;
        video.chapters = chapters;

        return video;
      });
    });
}


function getChaptersAtTime(t, uuid) {
  return chaps.findOne({ uuid, startNPT: { $lte: t }, endNPT: { $gte: t } });
}

function getVideoFromVendorId(vendor, id) {
  if (!vendor || !id) return Promise.reject(new Error('no vendor or no id'));
  return videos.findOne({ vendor, vendor_id: id });
}

function getVideoFromLocator(locator) {
  return videos.findOne({ locator });
}


function insertVideo(video) {
  video.timestamp = Date.now();
  const cbs = [];

  const { vendor } = video;
  const id = video.vendor_id;
  if (!vendor) return Promise.resolve();
  video.uuid = UUID(vendor + id, UUID.URL); // deterministic UUID

  console.log('Check for existent vendor/id.');
  return getVideoFromVendorId(video.vendor, video.vendor_id)
    .then((data) => {
      if (data) {
        console.log('Video already in db.');
        return Promise.resolve(video);
      }
      if (video.entities) {
        cbs.push(addEntities(video.uuid, video.entities));
        delete video.entities;
      }

      if (video.chapters) {
        cbs.push(addChapters(video.uuid, video.chapters));
        delete video.chapters;
      }

      // if (video.hotspots) {
      //   const { hotspots } = video;
      //   delete video.hotspots;
      //   // cbs.push(function (async_callback) {
      //   // addHotspots(video.uuid, hotspots, async_callback);
      //   // });
      // }
      return videos.insert(video);
    })
    .then(() => Promise.all(cbs))
    .then(() => video);
  // .catch((err) => {
  //   console.log(`DB insert fail. ${JSON.stringify(err)}`);
  //   videos.findOne({ uuid: video.uuid }).on('complete', (e, data) => {
  //     if (!e && data) { // retry with another uuid
  //       exports.insert(video, callback);
  //     } else {
  //       cb(e, video);
  //     }
  //   });
  // });
}

function updateVideoUuid(uuid, newVideo) {
  const cbs = [];

  let entities;
  if (newVideo.entities) {
    entities = newVideo.entities;
    delete newVideo.entities;

    cbs.push(() => addEntities(uuid, entities));
  }

  let chapters;
  if (newVideo.chapters) {
    chapters = newVideo.chapters;
    delete newVideo.chapters;

    cbs.push(() => addChapters(uuid, chapters));
  }

  return videos.findOneAndUpdate({ uuid }, { $set: newVideo }, { upsert: true, new: true })
    .then(() => {
      if (entities) newVideo.entities = entities;
      if (chapters) newVideo.chapters = chapters;

      return Promise.all(cbs);
    }).then(() => newVideo);
}

function setHotspotProcess(uuid, value) {
  return videos.update({ uuid }, { $set: { hotspotStatus: value } });
}

async function getHotspotProcess(uuid) {
  const data = await videos.findOne({ uuid });
  return data.hotspotStatus;
}

function addHotspots(uuid, hotspots) {
  return Promise.map(hotspots, (h) => {
    h.uuid = uuid;
    return hots.insert(h);
  });
}

async function hasEntities(uuid) {
  const data = await ents.findOne({ uuid });
  return !!data;
}

export default {
  getVideoFromUuid,
  getVideoFromLocator,
  getVideoFromVendorId,
  getFilterEntities,
  getChaptersAtTime,
  insertVideo,
  updateVideoUuid,
  updateVideo(newVideo) {
    return updateVideoUuid(newVideo.uuid, newVideo);
  },
  addEntities,
  hasEntities,
  setHotspotProcess,
  getHotspotProcess,
  addHotspots,
};
