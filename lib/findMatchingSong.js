module.exports = {
    endpoint: `/findMatchingSong`,
    type: `post`,
    buffer: false,
    func: async ({keys, idGen}, req, res) => {
        try {
            console.log(req.body)
            const obj = {
                results: await (require('../func/generalSong'))({
                    keys,

                    title: req.body.title || req.body.query || null,
                    artist: req.body.artist || req.body.author || null,
                    duration: req.body.duration || null
                })
            };
            //res.status(200)

            const str = Buffer.from(JSON.stringify(obj, null, 4))

            res.send(obj)
        } catch(e) {
            res.status(500);
            res.send({
                error: true,
                message: `Unable to search songs!`,
            })
        }
    }
}
