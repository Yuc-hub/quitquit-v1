import { expect, test } from "@playwright/test";

test("双方接受后才看到公开记录，解除好友立即撤销访问", async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pageA = await a.newPage();
  const pageB = await b.newPage();
  try {
    for (const page of [pageA, pageB]) {
      await page.goto("/");
      await page.getByRole("button", { name: "体验演示" }).click();
      await expect(page.getByRole("heading", { name: "今天的状态" })).toBeVisible();
      await page.goto("/review");
      await page.getByRole("link", { name: "添加好友" }).click();
    }
    await pageA.getByLabel("显示名称").fill("甲");
    await pageA.getByRole("button", { name: "创建共享身份" }).click();
    await expect(pageA.getByRole("button", { name: "生成邀请链接" })).toBeVisible();
    await pageA.getByRole("button", { name: "生成邀请链接" }).click();
    const inviteLink = await pageA.getByLabel("邀请链接").inputValue();

    await pageB.getByLabel("显示名称").fill("乙");
    await pageB.getByRole("button", { name: "创建共享身份" }).click();
    await pageB.goto(inviteLink);
    await expect(pageB.getByRole("region", { name: "好友邀请" })).toContainText("甲 邀请你成为好友");
    await pageB.getByRole("button", { name: "同意并成为好友" }).click();
    await pageA.getByRole("button", { name: "刷新好友" }).click();
    await expect(pageA.getByText("乙", { exact: true })).toBeVisible();

    await pageB.goto("/today");
    await pageB.getByRole("radio", { name: /还行/ }).click();
    await pageB.getByRole("button", { name: "保存今天" }).click();
    await pageB.getByLabel("公开的一句话（可选）").fill("今天的项目推进了一点。");
    await pageB.getByLabel("公开的工作状况（可选）").fill("项目推进中");
    await pageB.getByRole("button", { name: "分享这一天" }).click();
    await expect(pageB.getByText("这一天已分享。")).toBeVisible();

    await pageA.goto("/review");
    await expect(pageA.getByTestId("friend-updates")).toContainText("今天的项目推进了一点。");
    const current = new Date();
    const day = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
    const cell = pageA.getByTestId("calendar-grid").getByRole("button", { name: new RegExp(`^${day} `) });
    await expect(cell).toHaveAttribute("aria-label", /乙：还行/);
    await expect(cell.getByLabel("乙的心情")).toBeVisible();
    await pageA.getByRole("button", { name: `查看乙${day}的心情和留言` }).click();
    await expect(pageA.getByRole("dialog")).toContainText("工作状况：项目推进中");
    await expect(pageA.getByRole("dialog")).toContainText("留言：今天的项目推进了一点。");
    await pageA.getByRole("button", { name: "关闭弹窗" }).click();

    await pageA.goto("/friends");
    await pageA.getByRole("button", { name: "解除好友" }).click();
    await pageA.getByRole("dialog").getByRole("button", { name: "解除好友" }).click();
    await pageA.goto("/review");
    await expect(pageA.getByTestId("friend-updates")).not.toContainText("今天的项目推进了一点。");
    await expect(pageA.getByTestId("calendar-grid").getByRole("button", { name: new RegExp(`^${day} `) }).getByLabel("好友尚未分享心情")).toBeVisible();
  } finally {
    await a.close();
    await b.close();
  }
});
