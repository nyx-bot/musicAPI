module.exports = async (metrics) => {
    let io = null;
    try {
        io = require(`@pm2/io`);
    } catch(e) {
        console.warn(`PM2 io is not present on this system; skipping...`);
    }

    if(!io) return;

    console.log(`PM2 io found!`);

    let pm2Metrics = {};

    while(true) {
        for (o of Object.entries(metrics)) {
            if(o[0] == `streams` && metrics.type == 1) o[0] = `fallbackStreams`;
            
            if(!pm2Metrics[o[0]]) pm2Metrics[o[0]] = io.metric({
                name: o[0]
            });

            pm2Metrics[o[0]].set(o[1])
        }

        await new Promise(r => setTimeout(r, 1000));
    }
}