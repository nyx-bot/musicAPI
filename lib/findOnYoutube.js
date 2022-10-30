module.exports = {
    endpoint: `/findOnYoutube`,
    type: `post`,
    func: async ({keys, idGen}, req, res) => {
        const artist = req.body.artist;
        const title = req.body.title;
        const duration = Number(req.body.duration);
        const query = artist && title && duration ? null : req.body.query;
        if(!query && (!artist || !title || !duration)) return res.send({err: true, msg: `Missing body entries! (artist / title / duration)`})
        console.log(`artist: ${artist}\ntitle: ${title}\nduration: ${duration}`);

        require('../func/findYoutubeEquivalent')({ artist, title, duration, query }).then((equiv) => res.send(equiv)).catch(e => {
            console.error(e);
            res.status(500);
            res.send({
                error: true,
                message: `Unable to find youtube equivalent! (${e})`,
            })
        })
    }
}