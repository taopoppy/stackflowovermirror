const sql = require('mssql');
const axios = require('axios')
const schedule = require('node-schedule');
const Redis = require('ioredis')

// sqlserver数据库连接配置
const dbConfig = {
  user: "sa",
  password: "admin@123",
  server: "172.16.62.74",
  database: "StackOverflow",
  port: 1433,
  pool: {
      max: 1000,
      min: 0,
			acquireTimeoutMillis: 30000,
  		idleTimeoutMillis: 30000,
  },
	options: {
    encrypt: true, // for azure
    trustServerCertificate: true, // change to true for local dev / self-signed certs,
		requestTimeout:30000
  }
};

async function main() {
    // 连接sqlserver
    let pool = await sql.connect(dbConfig)
    global.sql = sql;
    global.pool = pool

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
			await global.redis.set("postrest", 0)
			console.log("清除睡眠成功")
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