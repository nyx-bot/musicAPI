const superagent = require('superagent');
const auth = require('../config.json').authKey;

module.exports = {
    endpoint: `/stopSendingPings`,
    func: async ({keys, idGen}, req, res) => {
        global.sendPings = false;
        global.sendHeartbeat = false;
        //keys.nyxPinger.stop();
        res.send(true)
        superagent.get(keys.mainLocation + `/unregisterMusicClient`).set(`auth`, auth).then(r => {
            console.log(`Unregistered API!`)
        }).catch(e => {
            if(keys.mainLocation && keys.mainLocation !== keys.mainLocation) {
                require(`superagent`).get(keys.mainLocation + `/unregisterMusicAPI`).then(r => {
                    console.log(`Unregistered API!`)
                }).catch(e => {
                    console.error(`failed to unregister musicAPI to nyx! (possibly offline?) // ${e}`)
                })
            } else console.error(`failed to unregister musicAPI to nyx! (possibly offline?) // ${e}\n- sidenote: no B location was registered.`);
        })
    }
}