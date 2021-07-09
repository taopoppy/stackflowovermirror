const sql = require('mssql');
const axios = require('axios')
const schedule = require('node-schedule');
const Redis = require('ioredis')
const { server, key, user, password } = require('../config')
// sqlserver数据库连接配置
const dbConfig = {
  user: user,
  password: password,
  server: server,
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


// sqlserver操作
async function upDateSql(time){
  try {
    // 进入睡眠模式
    await global.redis.set("postrest", 1)
    await global.redis.set("userrest", 1)
    console.log("进入睡眠")

    // 1. 请求当前id下面的这个数据
    let  endReq = await axios.get(`https://api.stackexchange.com/2.2/questions?key=${key}&site=stackoverflow&pagesize=1&fromdate=${time}&todate=${time+86400}&order=desc&sort=creation&filter=!)rp_N76R2r(84m5uf)Cb`)
    let startReq = await axios.get(`https://api.stackexchange.com/2.2/questions?key=${key}&site=stackoverflow&pagesize=1&fromdate=${time-86400}&todate=${time}&order=desc&sort=creation&filter=!)rp_N76R2r(84m5uf)Cb`)


    let start = startReq.data.items[0].question_id
    let tail = endReq.data.items[0].question_id

    // 2. 开始拼凑所需要的数据
    let tempDate = new Date(time*1000)
    let Time = tempDate.Format("yyyy-MM-dd")
    let Start = start+1
    let Tail = tail
    let Count = Tail - Start
    let Finish = 0


    // 开始写入数据库
    data = await global.pool.request()
    .input('Time', sql.NVarChar(100), Time)
    .input('Start', sql.NVarChar(100), Start)
    .input('Tail', sql.NVarChar(100), Tail)
    .input('Count', sql.Int, Count)
    .input('Finish', sql.Int, Finish)
    .query(`INSERT INTO Intervals (Time,Start,Tail,Count,Finish)
      VALUES (@Time,@Start,@Tail,@Count,@Finish)`
    )

    console.log(`${Time} 数据插入成功`)

    let sleepEnd = setTimeout(async()=> {
      await global.redis.set("postrest", 0)
      await global.redis.set("userrest", 0)
      console.log("清除睡眠")
      clearTimeout(sleepEnd)
    },10000)

  } catch (error) {
    console.log("catch error:", error)
    process.exit()
  }
}

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
        // 向数据库当intercal当中插入数据
        let today = new Date()
        let str = today.Format("yyyy-MM-dd")
        let yesterdayStr = `${str} 08:00:00`
        let yesterday = new Date(yesterdayStr)
        let yesterdayNumber = Date.parse(yesterday) / 1000

        console.log(`定时器触发：${today}`)
        await upDateSql(yesterdayNumber-86400)
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