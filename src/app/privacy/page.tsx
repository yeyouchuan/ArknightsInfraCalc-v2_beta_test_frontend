import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/LegalDocument";
import { isSklandFeatureEnabled } from "@/deployment";
import { legalIdentity } from "@/legal";
import { LEGAL_EFFECTIVE_DATE } from "@/legal-policy";

export const metadata: Metadata = {
  title: "隐私政策 · 可露希尔基建终端",
  description: "可露希尔基建终端如何处理排班数据。",
};

export default function PrivacyPage() {
  const identity = legalIdentity();
  const sklandEnabled = isSklandFeatureEnabled();
  return (
    <LegalDocument eyebrow="可露希尔基建终端" title="隐私政策" effectiveDate={LEGAL_EFFECTIVE_DATE}>
      {sklandEnabled ? <>
      <section>
        <h2 className="font-number">1. 适用范围与运营者</h2>
        <p>本政策适用于“可露希尔基建终端”（以下简称“本站”）。本站是非官方、非商业的排班辅助工具，与鹰角网络、森空岛及《明日方舟》官方不存在隶属、代理或背书关系。</p>
        <p>运营者：{identity.operatorName}。你可以通过<a href={identity.contactUrl}>项目问题反馈渠道</a>{identity.contactEmail ? <>或邮箱 <a href={`mailto:${identity.contactEmail}`}>{identity.contactEmail}</a></> : null}联系我们。</p>
      </section>

      <section>
        <h2 className="font-number">2. 我们处理哪些信息</h2>
        <h3>排班所需数据</h3>
        <ul>
          <li>森空岛二维码登录产生的 cred、token、设备标识和上游用户标识。</li>
          <li>绑定角色、干员持有与练度、基建设施、当前进驻、心情、制造配方和贸易订单。</li>
          <li>你导入的 MAA JSON、兼容表格、布局设置和生成的排班结果。</li>
        </ul>
        <h3>状态中心附加数据</h3>
        <p>只有你单独授权后，本站才会展示头像、UID、等级、理智、任务、公招、皮肤、训练、线索、活动和游戏进度。撤回状态中心授权不会退出登录，也不会影响排班。</p>
        <h3>必要的技术信息</h3>
        <p>为保障接口安全和排查故障，本站会短暂处理请求 ID、时间、路由、错误码、响应状态和经代理传递的网络地址；日志不记录请求正文或登录凭证。</p>
      </section>

      <section>
        <h2 className="font-number">3. 处理方式与目的</h2>
        <ul>
          <li>登录凭证经 AES-<span className="font-number">256</span>-GCM 加密后存入此浏览器的 HttpOnly Cookie，请求期间由本站服务端解密使用，不写入业务数据库。</li>
          <li>凭证仅用于同步角色数据、切换角色和刷新森空岛会话；本站不会自动签到或操作社区内容。</li>
          <li>森空岛的玩家信息接口会一次返回组合数据。即使只进行排班同步，服务端也可能瞬时收到状态中心字段；未获得附加授权时，这些字段会在白名单映射后立即丢弃，不返回浏览器、不写入运行记录。</li>
          <li>干员和布局数据会发送给本站部署的排班求解器，以生成轮班、效率概览和 MAA 导出。</li>
        </ul>
      </section>

      <section>
        <h2 className="font-number">4. 保存期限</h2>
        <ul>
          <li>森空岛登录凭证自扫码成功起固定保存 <span className="font-number">7</span> 天，刷新页面或 token 不会延长期限。</li>
          <li>服务端 CLI 运行记录最多保存 <span className="font-number">7</span> 天，你也可以随时提前删除。</li>
          <li>浏览器中的布局、干员 Box 和最近排班通常最多保存 <span className="font-number">30</span> 天；“删除全部森空岛数据”会立即移除其中的森空岛来源内容。</li>
          <li>未完成的二维码登录记录最多保留 <span className="font-number">10</span> 分钟。</li>
        </ul>
      </section>

      <section>
        <h2 className="font-number">5. 第三方服务</h2>
        <p>扫码登录和角色同步需要向森空岛及鹰角登录服务发送请求，并受<a href="https://assets.skland.com/protocols/agreement.html">森空岛使用许可及服务协议</a>与<a href="https://assets.skland.com/protocols/privacy.html">森空岛个人信息保护政策</a>约束。本站不会出售你的信息，也不会将登录凭证用于本政策列明目的以外的用途。</p>
      </section>

      <section>
        <h2 className="font-number">6. 你的选择与权利</h2>
        <ul>
          <li>你可以不使用森空岛登录，改用 MAA JSON 或兼容文件。</li>
          <li>你可以随时撤回状态中心授权。</li>
          <li>你可以使用“一键删除全部森空岛数据”，删除全部登录凭证、授权、同步数据和可关联的服务端记录；该操作不会删除你的森空岛官方账号。</li>
          <li>如需查询、更正或处理无法通过页面删除的信息，请通过本政策列明的联系渠道提交请求。</li>
        </ul>
      </section>

      <section>
        <h2 className="font-number">7. 未成年人</h2>
        <p>如果你属于法律规定的未成年人，请在监护人阅读并同意本政策后使用森空岛同步。监护人可以联系我们删除相关数据。</p>
      </section>

      <section>
        <h2 className="font-number">8. 安全与变更</h2>
        <p>本站采用 HTTPS、HttpOnly Cookie、同源校验、限流、字段白名单和最小日志等措施降低风险。互联网服务无法保证绝对安全；如政策内容或处理目的发生实质变化，本站会更新版本，并在下一次生成二维码前重新取得同意。</p>
      </section>
      </> : <>
        <section>
          <h2 className="font-number">1. 适用范围与运营者</h2>
          <p>本政策适用于“可露希尔基建终端”（以下简称“本站”）。本站是非官方、非商业的排班辅助工具，与鹰角网络及《明日方舟》官方不存在隶属、代理或背书关系。</p>
          <p>运营者：{identity.operatorName}。你可以通过<a href={identity.contactUrl}>项目问题反馈渠道</a>{identity.contactEmail ? <>或邮箱 <a href={`mailto:${identity.contactEmail}`}>{identity.contactEmail}</a></> : null}联系我们。</p>
        </section>

        <section>
          <h2 className="font-number">2. 我们处理哪些信息</h2>
          <ul>
            <li>你导入的 MAA JSON、兼容表格、布局设置和生成的排班结果。</li>
            <li>你主动提交的最小问题反馈，包括诊断编号、房间摘要和说明。</li>
            <li>保障接口安全和排查故障所需的请求 ID、时间、路由、错误码、响应状态和经代理传递的网络地址。</li>
          </ul>
          <p>日志不记录请求正文或完整干员数据。</p>
        </section>

        <section>
          <h2 className="font-number">3. 处理方式与目的</h2>
          <p>干员和布局数据会发送给本站部署的排班求解器，用于生成轮班、效率概览、练卡建议和 MAA 导出。浏览器只保存继续使用产品所需的白名单字段。</p>
        </section>

        <section>
          <h2 className="font-number">4. 保存期限</h2>
          <ul>
            <li>服务端 CLI 运行记录最多保存 <span className="font-number">7</span> 天。</li>
            <li>浏览器中的布局、干员 Box 和最近排班通常最多保存 <span className="font-number">30</span> 天。</li>
            <li>你可以随时使用页面中的清除功能删除浏览器本地数据。</li>
          </ul>
        </section>

        <section>
          <h2 className="font-number">5. 你的选择与权利</h2>
          <p>你可以不提交问题反馈，并可随时清除浏览器数据。如需查询、更正或处理无法通过页面删除的信息，请通过本政策列明的联系渠道提交请求。</p>
        </section>

        <section>
          <h2 className="font-number">6. 未成年人</h2>
          <p>如果你属于法律规定的未成年人，请在监护人阅读并同意本政策后使用本站。</p>
        </section>

        <section>
          <h2 className="font-number">7. 安全与变更</h2>
          <p>本站采用 HTTPS、同源校验、限流、字段白名单和最小日志等措施降低风险。互联网服务无法保证绝对安全；如政策内容或处理目的发生实质变化，本站会更新版本。</p>
        </section>
      </>}
    </LegalDocument>
  );
}
