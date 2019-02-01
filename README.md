# BoTTT-III
Pokemon Showdown chatroom bot specialized for the [VGC room](https://play.pokemonshowdown.com/vgc).

Installation
------------

BoTTT III requires [node.js](http://nodejs.org/) to run. It has the same version requirements as [Pokemon Showdown itself](https://github.com/Zarel/Pokemon-Showdown). I recommend installing the most recent stable version.

Next up is cloning this bot. This can be done in two ways: cloning it via `git` or downloading as ZIP.
Downloading it as ZIP is the easy and lazy way, but is a lot less handy to update than cloning this repository.

To install dependencies, run:

    npm install

Rename `config-example.js` to `config.js` and edit the variables in the file, such as the bot's name and password.
To change the commands that the bot responds to, edit `commands.js`.

Now, to start the bot, use:

    node main.js

Some information will be shown, and it will automatically join the room(s) you specified if no error occurs.

Development
-----------

Credits:
 - DaWoblefet (Development for the VGC room)
 - Morfent (Development of original BoTTT)
 - TalkTakesTime (Development of original BoTTT)
 - Quinella (Development of original BoTTT)

License
-------

BoTTT III is distributed under the terms of the [MIT License][5].

  [5]: https://github.com/Quinella/Pokemon-Showdown-Bot/blob/master/LICENSE

