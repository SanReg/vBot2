// Custom Discord emojis used by the bot. Change an ID here to swap it everywhere.
const EMOJI_ID = {
  sats: '1501104690790662216',
  wallet: '1501131578313670677',
  slice: '1501114342631014480',
  in: '1501119632352870481',
  out: '1501119649339936813',
  mineMiss: '1549029514817052713',
  crown: '1557018712127840418',
  rain: '1501110375154978916',
  peperain: '1501114711272460358',
  pepecute: '1501156277823471686',
  purpleflame: '1501111816334479441',
  bump: '1501113105994879088',
};

// Message-ready form: <:name:id> for static emojis, <a:name:id> for animated ones.
const EMOJI = {
  sats: `<:_sats:${EMOJI_ID.sats}>`,
  wallet: `<:wallet:${EMOJI_ID.wallet}>`,
  slice: `<:slice:${EMOJI_ID.slice}>`,
  in: `<:in:${EMOJI_ID.in}>`,
  out: `<:out:${EMOJI_ID.out}>`,
  crown: `<:crown:${EMOJI_ID.crown}>`,
  rain: `<a:rain:${EMOJI_ID.rain}>`,
  peperain: `<a:peperain:${EMOJI_ID.peperain}>`,
  pepecute: `<a:pepecute:${EMOJI_ID.pepecute}>`,
  purpleflame: `<a:purpleflame:${EMOJI_ID.purpleflame}>`,
  bump: `<a:bump:${EMOJI_ID.bump}>`,
  mineMiss: `<a:joker:${EMOJI_ID.mineMiss}>`,
};

module.exports = { EMOJI, EMOJI_ID };
