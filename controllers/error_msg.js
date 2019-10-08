const msg = {
  404: {
    code: 404,
    message: 'resource not found',
    invite: 'try with another video!',
  },
  400: {
    code: 400,
    message: 'bad request',
    invite: 'are you sure of what you search?',
  },
  500: {
    code: 500,
    message: 'something went wrong',
    invite: 'you can continue to navigate HyperTED',
  },
};

export default function (code = 500) {
  if (!(code in msg)) return msg[500];
  return msg[code];
}
