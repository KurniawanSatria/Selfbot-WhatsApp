const axios = require('axios');



async function ttsave(url) {
  try {
    const requestData = new URLSearchParams({
      url: url,
      count: 12,
      cursor: 0,
      web: 1,
      hd: 1
    });

    const response = await axios.post('https://tikwm.com/api/', requestData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    const apiData = response.data;

    if (apiData.code !== 0) {
      return {
        author: "Herza",
        status: 400,
        message: apiData.msg || "API request failed"
      };
    }

    const data = apiData.data;

    const isSlide = data.images && data.images.length > 0;
    const isVideo = data.duration > 0 && (data.play || data.hdplay);

    let contentType;
    if (isSlide) {
      contentType = "slide";
    } else if (isVideo) {
      contentType = "video";
    } else {
      contentType = "unknown";
    }

    const result = {
      author: "Saturia",
      status: 200,
      data: {
        type: contentType,
        id: data.id,
        title: data.title,
        region: data.region,
        cover: `https://tikwm.com${data.cover}`,
        duration: data.duration,

        author: {
          id: data.author.id,
          username: data.author.unique_id,
          nickname: data.author.nickname,
          avatar: `https://tikwm.com${data.author.avatar}`
        },

        stats: {
          play_count: data.play_count,
          digg_count: data.digg_count,
          comment_count: data.comment_count,
          share_count: data.share_count,
          download_count: data.download_count,
          collect_count: data.collect_count
        },

        music: data.music_info ? {
          id: data.music_info.id,
          title: data.music_info.title,
          author: data.music_info.author,
          duration: data.music_info.duration,
          original: data.music_info.original,
          play_url: data.music_info.play
        } : null,

        created_time: data.create_time
      }
    };

    if (contentType === "video") {
      result.data.video = {
        play_url: `https://tikwm.com${data.play}`,
        watermark_play_url: `https://tikwm.com${data.wmplay}`,
        hd_play_url: `https://tikwm.com${data.hdplay}`,
        size: data.size,
        wm_size: data.wm_size,
        hd_size: data.hd_size
      };
      result.data.music_url = `https://tikwm.com${data.music}`;
    } else if (contentType === "slide") {
      result.data.images = data.images.map(img => {
        if (img.startsWith('http')) {
          return img;
        }
        return `https://tikwm.com${img}`;
      });
      result.data.music_url = `https://tikwm.com${data.music}`;
    }

    return result;

  } catch (error) {
    return {
      author: "Saturia",
      status: 500,
      message: "Error occurred while scraping",
      error: error.message
    };
  }
}

module.exports = {
  ttsave
};