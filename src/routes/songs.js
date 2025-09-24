const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { listSongs, createSong, updateSong, deleteSong } = require('../controllers/songsController');

router.get('/', authMiddleware, listSongs);
router.post('/', authMiddleware, createSong);
router.put('/:id', authMiddleware, updateSong);
router.delete('/:id', authMiddleware, deleteSong);

module.exports = router;
