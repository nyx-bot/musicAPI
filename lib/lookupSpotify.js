module.exports = {
     endpoint: `/lookupSpotify/:arg(*+)`,
     func: async ({keys, idGen}, req, res) => require(`../func/lookupSpotify`)({ keys, q: req.params.arg }).then(r => {
          if(r) {
               res.send(r)
          } else {
               res.send({
                    error: true,
                    message: `spotify not work :(`,
               })
          }
     }).catch(e => {
          res.send({
               error: true,
               message: `spotify not work :(`,
          })
     })
}