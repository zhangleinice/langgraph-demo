import { tool } from "@langchain/core/tools";
import { z } from "zod";

// ========== 核心思考工具：Sequential Thinking ==========

export const sequentialThinkingTool = tool(
  (input: {
    thought: string;
    toDoList: string;
    nextThoughtNeeded: string;
    thoughtNumber: string;
    totalThoughts: string;
    isRevision: string;
    revisesThought: string;
    branchFromThought: string;
    branchId: string;
    needsMoreThoughts: string;
  }) => {
    const {
      thought,
      toDoList,
      nextThoughtNeeded,
      thoughtNumber,
      totalThoughts,
      isRevision,
      revisesThought,
    } = input;

    // 记录思考过程
    const thinkingLog = `
## 思考记录 #${thoughtNumber}/${totalThoughts}

### 当前思考
${thought}

### 待办事项
${toDoList}

### 状态
- 是否需要继续思考: ${nextThoughtNeeded}
- 是否为修正思考: ${isRevision}
${isRevision === "true" ? `- 修正的思考编号: ${revisesThought}` : ""}

---
`;

    return thinkingLog;
  },
  {
    name: "sequentialThinking",
    description: `一个用于动态和反思性解决问题的详细工具。
这个工具通过可以适应和演变的灵活思考过程来帮助分析问题。
每个思考都可以在理解加深时建立、质疑或修改先前的见解。

# ⚠️ 重要：强制调用时机
**必须在以下情况下调用本工具**：
1. ✅ 任务开始时（接收到用户需求后必须第一时间调用）
2. ✅ 每次执行其他工具前必须先调用本工具进行规划
3. ✅ 完成某个阶段性任务后必须立即调用更新状态
4. ✅ 遇到需要决策的情况时必须调用分析决策
5. ✅ 状态变更时必须调用更新进度

上述情况缺一不可，尤其是在执行其他工具前，必须先调用sequentialThinking进行思考规划。

使用场景：
- 将复杂问题分解为步骤
- 规划和设计，允许修改
- 可能需要调整方向的分析
- 初始范围不明确的问题
- 需要多步骤解决方案的问题
- 需要在多个步骤中保持上下文的任务
- 需要过滤无关信息的情况

主要特点：
- 可以随着进展调整 total_thoughts
- 可以质疑或修改先前的思考
- 即使在看似结束时也可以添加更多思考
- 可以表达不确定性并探索替代方法
- 思考不必线性构建 - 可以分支或回溯
- 生成解决方案假设
- 基于思考链步骤验证假设
- 重复过程直到满意
- 提供正确答案`,
    schema: z.object({
      thought: z.string().describe("当前的思考步骤"),
      toDoList: z.string().describe("一个动态的待办事项列表"),
      nextThoughtNeeded: z.string().describe('是否需要另一个思考步骤，传入字符串"true"或"false"'),
      thoughtNumber: z.string().describe("当前思考编号"),
      totalThoughts: z.string().describe("估计需要的总思考数"),
      isRevision: z.string().describe("是否修改先前的思考"),
      revisesThought: z.string().describe("正在重新考虑的思考编号"),
      branchFromThought: z.string().describe("分支点的思考编号"),
      branchId: z.string().describe("分支标识符"),
      needsMoreThoughts: z.string().describe("是否需要更多思考"),
    }),
  }
);

// ========== 生页面Agent专用工具集（LangChain标准格式） ==========

// 工具1: 需求分析工具
export const requirementAnalysisTool = tool(
  (input: { task: string }) => {
    const { task } = input;

    if (task.includes("登录") || task.includes("用户管理")) {
      return `## PRD文档 - 用户登录系统

### 1. 需求背景
用户需要一个安全可靠的登录系统，支持账号密码登录。

### 2. 功能需求
- 用户输入账号和密码
- 前端表单验证（非空、格式校验）
- 后端身份验证
- 登录成功后跳转到主页
- 登录失败提示错误信息

### 3. 非功能需求
- 密码需加密传输（HTTPS）
- 支持记住密码功能
- 登录失败3次后锁定账号5分钟

### 4. 交互流程
用户打开登录页 → 输入账号密码 → 点击登录 → 验证通过 → 跳转主页`;
    }

    if (task.includes("电商") || task.includes("购物")) {
      return `## PRD文档 - 电商购物车系统

### 1. 需求背景
用户需要在购物过程中临时存储商品，方便统一结算。

### 2. 功能需求
- 添加商品到购物车
- 修改商品数量
- 删除购物车商品
- 计算总价
- 一键清空购物车

### 3. 数据结构
- 商品ID、名称、价格、数量、图片
- 购物车总金额、总数量

### 4. 交互流程
浏览商品 → 点击加入购物车 → 查看购物车 → 修改数量 → 结算`;
    }

    if (task.includes("表格") || task.includes("列表") || task.includes("CRUD")) {
      return `## PRD文档 - 数据表格系统

### 1. 需求背景
用户需要一个数据展示和管理的表格系统。

### 2. 功能需求
- 数据列表展示（分页）
- 搜索和筛选功能
- 新增、编辑、删除操作
- 批量操作支持
- 数据导出功能

### 3. 交互流程
进入页面 → 加载数据 → 查看/搜索 → 操作数据 → 保存/刷新`;
    }

    return `## PRD文档

### 1. 需求概述
${task}

### 2. 核心功能
- 功能点1: 待细化
- 功能点2: 待细化

### 3. 用户故事
作为用户，我希望能够...以便...`;
  },
  {
    name: "requirementAnalysis",
    description: "分析用户需求并生成结构化的PRD文档。当用户提出页面需求时，首先调用此工具进行需求分析。",
    schema: z.object({
      task: z.string().describe("用户的原始需求描述"),
    }),
  }
);

// 工具2: 技术方案设计工具
export const technicalDesignTool = tool(
  (input: { prd: string }) => {
    const { prd } = input;

    if (prd.includes("登录") || prd.includes("认证")) {
      return `## 技术方案 - 用户认证系统

### 1. 技术选型
- 前端框架: React 18
- UI组件库: Ant Design 5.x
- 状态管理: React Hooks
- 表单验证: 内置验证

### 2. 页面结构
- 登录表单组件
- 错误提示组件
- 加载状态组件

### 3. 核心逻辑
- 表单验证（前端）
- 模拟API调用
- 登录状态管理
- 错误处理

### 4. 样式设计
- 响应式布局
- 现代化UI风格
- 动画效果`;
    }

    if (prd.includes("购物车") || prd.includes("电商")) {
      return `## 技术方案 - 购物车系统

### 1. 技术选型
- 前端: React + Ant Design
- 状态管理: useState/useReducer
- 数据持久化: localStorage

### 2. 组件设计
- 商品列表组件
- 购物车组件
- 结算组件

### 3. 数据流
用户操作 → 更新State → 同步localStorage → 重新渲染`;
    }

    if (prd.includes("表格") || prd.includes("CRUD")) {
      return `## 技术方案 - 数据表格系统

### 1. 技术选型
- 前端: React + Ant Design Table
- 数据管理: useState
- 模拟数据: Mock数据

### 2. 功能实现
- Table组件配置
- 分页、排序、筛选
- 增删改查操作
- 表单弹窗`;
    }

    return `## 技术方案

### 1. 技术栈
- 前端: React + Ant Design
- 样式: CSS-in-JS

### 2. 组件设计
- 主组件
- 子组件若干`;
  },
  {
    name: "technicalDesign",
    description: "根据PRD文档设计技术方案，包括技术选型、架构设计、组件设计等。在需求分析完成后调用。",
    schema: z.object({
      prd: z.string().describe("需求分析生成的PRD文档内容"),
    }),
  }
);

// 工具3: API接口查询工具
export const apiSearchTool = tool(
  (input: { query: string }) => {
    const { query } = input;

    if (query.includes("登录") || query.includes("auth")) {
      return `## 查询到的API接口

### POST /api/auth/login
**功能**: 用户登录
**请求参数**:
\`\`\`json
{
  "username": "string",
  "password": "string"
}
\`\`\`
**响应**:
\`\`\`json
{
  "code": 200,
  "data": {
    "token": "xxx",
    "userInfo": { "id": 1, "username": "admin" }
  }
}
\`\`\`

### GET /api/user/info
**功能**: 获取用户信息
**请求头**: Authorization: Bearer {token}
**响应**: 用户详细信息`;
    }

    if (query.includes("商品") || query.includes("product")) {
      return `## 查询到的API接口

### GET /api/products
**功能**: 获取商品列表
**响应**:
\`\`\`json
{
  "code": 200,
  "data": [
    { "id": 1, "name": "商品1", "price": 99.9 }
  ]
}
\`\`\``;
    }

    if (query.includes("用户") || query.includes("user")) {
      return `## 查询到的API接口

### GET /api/users
**功能**: 获取用户列表
**参数**: page, pageSize
**响应**: 分页用户数据

### POST /api/users
**功能**: 创建用户
**参数**: username, email, role`;
    }

    return `## 查询结果

未找到相关API接口，建议使用Mock数据。`;
  },
  {
    name: "apiSearch",
    description: "查询后端API接口文档，获取接口地址、参数、响应格式等信息。可选工具，用于需要调用真实接口的场景。",
    schema: z.object({
      query: z.string().describe("API查询关键词，如'登录接口'、'用户管理接口'"),
    }),
  }
);

// 工具4: 代码生成工具
export const generateReactCodeTool = tool(
  (input: { design: string; apiInfo?: string }) => {
    const { design } = input;

    if (design.includes("登录") || design.includes("认证")) {
      return `\`\`\`jsx
import React, { useState } from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import './App.css';

const App = () => {
  const [loading, setLoading] = useState(false);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      // 模拟API调用
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (values.username === 'admin' && values.password === '123456') {
        message.success('登录成功！');
        console.log('登录信息:', values);
      } else {
        message.error('用户名或密码错误');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <Card title="用户登录" className="login-card">
        <Form
          name="login"
          onFinish={onFinish}
          autoComplete="off"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="用户名"
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
              size="large"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              size="large"
            >
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default App;
\`\`\`

\`\`\`css
/* App.css */
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-card {
  width: 400px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
\`\`\``;
    }

    if (design.includes("购物车")) {
      return `\`\`\`jsx
import React, { useState } from 'react';
import { Table, Button, InputNumber, Space, Card, message } from 'antd';
import { DeleteOutlined, ShoppingCartOutlined } from '@ant-design/icons';

const App = () => {
  const [cartItems, setCartItems] = useState([
    { id: 1, name: '商品A', price: 99.9, quantity: 1 },
    { id: 2, name: '商品B', price: 199.9, quantity: 2 },
  ]);

  const updateQuantity = (id, quantity) => {
    setCartItems(items =>
      items.map(item => item.id === id ? { ...item, quantity } : item)
    );
  };

  const removeItem = (id) => {
    setCartItems(items => items.filter(item => item.id !== id));
    message.success('已移除商品');
  };

  const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const columns = [
    { title: '商品名称', dataIndex: 'name', key: 'name' },
    { title: '单价', dataIndex: 'price', key: 'price', render: (price) => \`¥\${price}\` },
    {
      title: '数量',
      key: 'quantity',
      render: (_, record) => (
        <InputNumber
          min={1}
          value={record.quantity}
          onChange={(value) => updateQuantity(record.id, value)}
        />
      ),
    },
    {
      title: '小计',
      key: 'subtotal',
      render: (_, record) => \`¥\${(record.price * record.quantity).toFixed(2)}\`,
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Button
          type="link"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeItem(record.id)}
        >
          删除
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={<><ShoppingCartOutlined /> 购物车</>}
        extra={<span>共 {cartItems.length} 件商品</span>}
      >
        <Table
          dataSource={cartItems}
          columns={columns}
          rowKey="id"
          pagination={false}
        />
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <Space size="large">
            <span style={{ fontSize: 18 }}>
              总计: <strong style={{ color: '#ff4d4f', fontSize: 24 }}>¥{total.toFixed(2)}</strong>
            </span>
            <Button type="primary" size="large">
              去结算
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  );
};

export default App;
\`\`\``;
    }

    return `\`\`\`jsx
import React from 'react';
import { Card } from 'antd';

const App = () => {
  return (
    <Card title="示例页面">
      <p>这是一个基础的React组件</p>
    </Card>
  );
};

export default App;
\`\`\``;
  },
  {
    name: "generateCode",
    description: "根据技术方案生成完整的React代码，包括组件代码和样式代码。在技术方案设计完成后调用。",
    schema: z.object({
      design: z.string().describe("技术方案文档内容"),
      apiInfo: z.string().optional().describe("API接口信息（可选）"),
    }),
  }
);

// 工具5: 代码审查工具
export const codeReviewTool = tool(
  (input: { code: string }) => {
    const { code } = input;
    const issues: string[] = [];

    if (!code.includes("try") && !code.includes("catch") && code.includes("async")) {
      issues.push("⚠️ 异步代码建议添加错误处理");
    }
    if (code.includes("var ")) {
      issues.push("⚠️ 建议使用 const/let 替代 var");
    }
    if (!code.includes("//") && !code.includes("/*") && code.length > 300) {
      issues.push("💡 建议添加必要的代码注释");
    }

    const score = Math.max(70, 100 - issues.length * 10);

    return `## 代码审查报告

### 质量评分: ${score}/100

${issues.length > 0 ? `### 发现的问题:\n${issues.map((issue, i) => `${i + 1}. ${issue}`).join("\n")}` : "✅ 代码质量良好"}

### 建议:
- 遵循React最佳实践
- 使用TypeScript增强类型安全
- 添加单元测试`;
  },
  {
    name: "codeReview",
    description: "审查生成的代码质量，检查潜在问题并给出改进建议。在代码生成完成后可选调用。",
    schema: z.object({
      code: z.string().describe("需要审查的代码内容"),
    }),
  }
);

// ========== 其他Agent的简单工具 ==========

export const simpleAnalysisTool = (query: string): string => {
  return `## 数据分析结果

根据查询: "${query}"

### 分析结论:
- 数据趋势: 稳定增长
- 关键指标: 正常范围
- 建议: 继续观察

（这是一个简化的分析工具示例）`;
};

export const simpleChatTool = (message: string): string => {
  return `收到消息: "${message}"\n\n这是一个简单的对话响应。`;
};
