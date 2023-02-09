module.exports = {
    endpoint: `/waveform/:url(*+)`,
    type: `get`,
    func: async ({keys, idGen}, req, res) => {
        const length = req.query.length ? req.query.length : 15;
        delete req.query.length;

        const queryString = Object.entries(req.query).map((q, index) => `${index === 0 ? `?` : `&`}${q[0]}=${q[1]}`).join(``);
        const link = req.params.url + queryString;
        console.log(link);

        const info = await require(`../func/getInfo`)(link, keys, false, true);

        console.log(`--- DURATION`,info.duration)

        if(info.duration) {
            require(`../func/createWaveform`)({
                id: link,
                length
            }).then(data => {
                res.send({
                    error: false,
                    data
                })
            }).catch(e => {
                res.send({
                    error: true,
                    message: typeof e == `string` ? e : `(Internal server error)`
                });
                console.log(e)
            })
        } else {
            res.send({
                error: false,
                data: `0,`.repeat(length).split(`,`).slice(0, -1)
            })
        }
    }
}