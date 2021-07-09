const schedule = require('node-schedule');
const Redis = require('ioredis')

async function main() {
    // 连接redis
    const redis = new Redis({
      port:'6379'
      // password:123456
    })
    global.redis = redis

    // 定义规则
    let rule = new schedule.RecurrenceRule();
    rule.hour =0;
    rule.minute =0;
    rule.second =0;

    // 启动任务
    let job = schedule.scheduleJob(rule, async () => {
      // 进入睡眠模式
      await global.redis.set("postrest", 1)
      console.log("进入睡眠")

      let sleepEnd = setTimeout(async()=> {
        await global.redis.set("postrest", 0)
        console.log("清除睡眠")
        clearTimeout(sleepEnd)
      },5000)
    });
}

Date.prototype.Format = function (fmt) { //author: meizz
    var o = {
        "M+": this.getMonth() + 1, //月份
        "d+": this.getDate(), //日
        "h+": this.getHours(), //小时
        "m+": this.getMinutes(), //分
        "s+": this.getSeconds(), //秒
        "q+": Math.floor((this.getMonth() + 3) / 3), //季度
        "S": this.getMilliseconds() //毫秒
    };
    if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (var k in o)
        if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    return fmt;
};

main()