# 我是如何实现stackoverflow中文版的

如果你是方达的员工，请不要吝啬你的star，点一个再往下看

## 问题的提出
`stackoverflow`是全球最大的编程问答网站，每天大约产生5000个以上的问题，无论是问题、讨论过程还是最后的答案，都表现出很高的质量，但中文问题讨论极少。对于习惯于中文搜索问题的开发者来说，存在两大问题，一是网站访问速度较慢，二是不能用中文搜索。所以作者就产生了开发[stackoverflow中文版](https://developer.opendao.cn/)的想法，实现以下功能：
1、数据基本上与stackoverflow.com保持同步
2、同步数据过程中将问题、讨论、答案进行同步翻译成中文
3、用中文搜素问题及内容
4、用tag归类问题
5、即将推出APP

## 数据来源
`stackoverflow`极其开放，网站定期释出全库的[备份](https://meta.stackoverflow.com/questions/295508/download-stack-overflow-database),从这个备份还原到`sqlserver`,可以得到大约三个月前的所有数据，近期的数据，可通过`https://api.stackexchange.com/`的`API`获取，由于此网站有10000次/天的请求限制，所以将将数据段进行切分，用多台服务器（多个IP)获取数据，写入`SQLServer`。一般来说，需要4台服务器，即可追上`stackoverflow`的新增记录同步。

## 翻译工作
由于`stackexchange`返回的`body`参数字符串是`html`类型的字符串，我们使用免费翻译软件翻译时会忽略`code`、`pre`、`strong`标签当中的内容，对字符串进行特殊的处理，使用队列`queue`的方式，将字符串所包含的非翻译的部分以遍历的方式将其保存在队列当中，将剩余的部分进行翻译，按照队列依次出队的顺序分别插入到翻译结果的标记位当中，翻译的结果写回`SQLServer`中。

## 搜索实现
为了实现全文搜索， 达到用中文搜索问题和回答内容效果，用到了ES（elasticsearch）搜索引擎安装，每天使用`Datax`定时从`SQLServer`同步数据到`ES`。

## 建立网站
参照`stackexchange.com`和一些开源项目，建立了`stackoverflow`中文版网站，目前还有完善中。

## 开源
做为开源加速网站`gitclone.com`的开发者，作者一直致力于在开源社区的贡献，`https://developer.opendao.cn/`的技术实现也在`github`开源。
+ 作者的主页是：[https://github.com/taopoppy](https://github.com/taopoppy)
+ 开源项目地址：[https://github.com/taopoppy/stackflowovermirror](https://github.com/taopoppy/stackflowovermirror)。